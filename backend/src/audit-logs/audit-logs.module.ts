import { Controller, Get, Injectable, Module, Query, Res, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import { PulseReportPdfService } from '../pulse-reports/pulse-report-pdf.service';
import { PulseReportsModule } from '../pulse-reports/pulse-reports.module';
import type { Response } from 'express';
import ExcelJS from 'exceljs';

// Rótulo humano de cada ação, pro CSV/Excel/PDF (mesmo texto já usado no
// StatusBadge da tela — só duplicado aqui porque é backend, não tem como
// importar direto do componente React).
const ACTION_LABELS: Record<string, string> = {
  LOGIN: 'Login',
  LOGOUT: 'Logout',
  CADASTRO: 'Cadastro',
  EDICAO: 'Edição',
  EXCLUSAO: 'Exclusão',
  FEEDBACK: 'Feedback',
  FECHAMENTO: 'Fechamento',
  GERACAO_IA: 'Análise Preditiva',
  GERACAO_PDF: 'Geração de PDF',
};

// Teto de segurança pra exportação — evita travar o servidor num caso
// extremo (combinado com o Erick). Se precisar de mais, é só filtrar por
// ação primeiro.
const EXPORT_LIMIT = 5000;

@Injectable()
class AuditLogsService {
  constructor(
    private prisma: PrismaService,
    private pdfService: PulseReportPdfService,
  ) {}

  // ⚠️ MÉTODO EXISTENTE — não alterado, continua exatamente como estava
  // (mesma assinatura, mesmo comportamento), pra não impactar nada que já
  // funciona. A tela nova usa findPaginated() abaixo, não este aqui.
  findAll(take: number, action?: string) {
    return this.prisma.auditLog.findMany({
      where: action ? { action: action as any } : undefined,
      include: { user: { select: { fullName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, 200),
    });
  }

  // Paginação de verdade (20 por página, pedido do Erick) — endpoint novo,
  // separado do findAll() acima.
  async findPaginated(page: number, pageSize: number, action?: string) {
    const where = action ? { action: action as any } : undefined;
    const safePage = Math.max(page, 1);
    const safePageSize = Math.min(Math.max(pageSize, 1), 100);

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { fullName: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items,
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.max(Math.ceil(total / safePageSize), 1),
    };
  }

  // Busca pra exportação — todos os registros que batem com o filtro,
  // até o teto de segurança (combinado com o Erick).
  private findForExport(action?: string) {
    return this.prisma.auditLog.findMany({
      where: action ? { action: action as any } : undefined,
      include: { user: { select: { fullName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: EXPORT_LIMIT,
    });
  }

  private formatRows(logs: Awaited<ReturnType<AuditLogsService['findForExport']>>) {
    return logs.map((log) => ({
      dataHora: new Date(log.createdAt).toLocaleString('pt-BR'),
      quem: log.user?.fullName ?? '—',
      email: log.user?.email ?? '—',
      acao: ACTION_LABELS[log.action] ?? log.action,
      rota: log.entity ?? '—',
    }));
  }

  async exportCsv(action?: string): Promise<string> {
    const rows = this.formatRows(await this.findForExport(action));
    const header = 'Quando,Quem,E-mail,Ação,Rota';
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = rows.map((r) => [r.dataHora, r.quem, r.email, r.acao, r.rota].map(escape).join(','));
    return [header, ...lines].join('\n');
  }

  async exportXlsx(action?: string): Promise<Buffer> {
    const rows = this.formatRows(await this.findForExport(action));
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Auditoria');
    sheet.columns = [
      { header: 'Quando', key: 'dataHora', width: 20 },
      { header: 'Quem', key: 'quem', width: 28 },
      { header: 'E-mail', key: 'email', width: 30 },
      { header: 'Ação', key: 'acao', width: 20 },
      { header: 'Rota', key: 'rota', width: 30 },
    ];
    sheet.getRow(1).font = { bold: true };
    rows.forEach((r) => sheet.addRow(r));
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async exportPdf(action?: string): Promise<Buffer> {
    const rows = this.formatRows(await this.findForExport(action));
    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body { font-family: Arial, sans-serif; font-size: 11px; color: #0F172A; padding: 24px; }
            h1 { font-size: 16px; margin-bottom: 4px; }
            p.sub { color: #64748B; font-size: 11px; margin-top: 0; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; }
            th { text-align: left; background: #F8FAFC; padding: 6px 8px; border-bottom: 1px solid #E2E8F0; font-size: 10px; text-transform: uppercase; color: #64748B; }
            td { padding: 6px 8px; border-bottom: 1px solid #F1F5F9; }
          </style>
        </head>
        <body>
          <h1>PulseOne — Auditoria</h1>
          <p class="sub">${rows.length} registro(s) — gerado em ${new Date().toLocaleString('pt-BR')}</p>
          <table>
            <thead>
              <tr><th>Quando</th><th>Quem</th><th>E-mail</th><th>Ação</th><th>Rota</th></tr>
            </thead>
            <tbody>
              ${rows
                .map(
                  (r) =>
                    `<tr><td>${r.dataHora}</td><td>${r.quem}</td><td>${r.email}</td><td>${r.acao}</td><td>${r.rota}</td></tr>`,
                )
                .join('')}
            </tbody>
          </table>
        </body>
      </html>`;
    return this.pdfService.generatePdf(html);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('audit-logs')
class AuditLogsController {
  constructor(private auditLogsService: AuditLogsService) {}

  // ⚠️ ROTA EXISTENTE — não alterada, continua exatamente igual.
  @Get()
  findAll(@Query('take') take?: string, @Query('action') action?: string) {
    return this.auditLogsService.findAll(take ? parseInt(take, 10) : 100, action);
  }

  @Get('paginated')
  findPaginated(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('action') action?: string,
  ) {
    return this.auditLogsService.findPaginated(
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 20,
      action,
    );
  }

  @Get('export/csv')
  async exportCsv(@Query('action') action: string | undefined, @Res() res: Response) {
    const csv = await this.auditLogsService.exportCsv(action);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="auditoria.csv"',
    });
    res.send('\uFEFF' + csv); // BOM — abre certinho acentuado no Excel
  }

  @Get('export/xlsx')
  async exportXlsx(@Query('action') action: string | undefined, @Res() res: Response) {
    const buffer = await this.auditLogsService.exportXlsx(action);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="auditoria.xlsx"',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get('export/pdf')
  async exportPdf(@Query('action') action: string | undefined, @Res() res: Response) {
    const buffer = await this.auditLogsService.exportPdf(action);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="auditoria.pdf"',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
}

@Module({
  imports: [PulseReportsModule],
  controllers: [AuditLogsController],
  providers: [AuditLogsService],
})
export class AuditLogsModule {}

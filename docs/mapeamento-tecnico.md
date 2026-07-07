# PULSEONE — MAPEAMENTO TÉCNICO COMPLETO
**Versão do documento:** 1.2.0
**Status:** Base para início de desenvolvimento (revisado após correções obrigatórias + isolamento por área)
**Referências aplicadas:** PulseOne_Logomarca > PulseOne_Demo_das_Telas > PulseOne_Design_System > PRD v1.0

**Decisões confirmadas na rodada anterior:**
- Sem fotos em nenhum lugar do sistema (inclusive PDF) — avatar sempre por iniciais.
- IA: Anthropic API substitui OpenAI API em todas as menções do PRD.
- PDF: Puppeteer (HTML→PDF) como solução principal. PDFKit apenas em uso pontual, se necessário.
- **Domínio oficial**: `pulseone.belleplanner.com.br`. **Rodapé obrigatório (PRD seção 3)** passa de "Desenvolvido por Erick Torritese" para **"Desenvolvido por BellePlanner"** — consolidando o PulseOne no catálogo de produtos BellePlanner. Aplicado no sistema autenticado (`components/shared/Footer.tsx`); pendente aplicar também na Landing Page (Sprint 6) e no PDF final (Sprint 5) quando forem construídos.

**Correções obrigatórias aplicadas na v1.1.0:**
1. Autoavaliação passa a ser exibida apenas como referência informativa — **não entra no cálculo do score final**.
2. Vínculo de gestor deixa de ser um campo manual (`managerId`) e passa a ser **derivado do cargo** (`Position.isManager`) combinado com a área do usuário.
3. Adicionados tokens de **confirmação de e-mail** e **reset de senha** como entidades próprias (com expiração).
4. `PulseReport` ganhou um **status individual explícito** por colaborador/ciclo.
5. Regra de visibilidade: colaborador só enxerga resultado do ciclo **após `finalizedAt` preenchido**.
6. Seed do admin mantido com troca de senha obrigatória no primeiro login.
7. Modelo da Anthropic API deixa de ser hardcoded e passa a ser **parametrizado via `.env`**.

**Correções obrigatórias aplicadas na v1.2.0 — isolamento por área (implementado antes da Sprint 1):**
8. **Feedback fechado por área**: avaliação de colegas só ocorre dentro da mesma `areaId`. Ver seção 5.1.
9. **Dashboard do gestor com evolução da área**: `dashboard/manager` passa a trazer histórico ciclo a ciclo da área, não só o status atual. Ver seção 5.2.
10. **Cadastro pelo gestor, restrito à própria área**: `GESTOR` ganhou permissão de `POST/GET/PATCH/DELETE /users`, mas toda operação é travada no service pela `areaId` do próprio gestor — mesmo que a requisição tente forçar outro valor. **Já implementado e entregue no código desta rodada.**
11. **`role` deixou de ser um campo livre no cadastro**: é sempre derivado do cargo (`Position.isManager`) — fonte única de verdade, eliminando a possibilidade de alguém ser cadastrado como gestor/colaborador de forma inconsistente com o cargo escolhido. `ADMIN` só é atribuído explicitamente por outro `ADMIN`. **Já implementado e entregue no código desta rodada.**

---

## 1. SCHEMA DE BANCO (PRISMA / POSTGRESQL)

```prisma
// ==========================
// ENUMS
// ==========================

enum UserRole {
  ADMIN
  GESTOR
  COLABORADOR
}

enum PulseCycleStatus {
  RASCUNHO
  ABERTO
  ENCERRADO
  EM_CONSOLIDACAO
  FINALIZADO
  ARQUIVADO
}

enum PulseEvaluationType {
  AUTOAVALIACAO
  GESTOR
  COLEGA
}

enum PulseEvaluationStatus {
  PENDENTE
  FINALIZADO
}

enum PulseReportStatus {
  EM_ANDAMENTO        // avaliações do ciclo ainda em curso para este colaborador
  AGUARDANDO_IA       // encerrado, aguardando geração/revisão da análise de IA
  AGUARDANDO_PARECER  // IA gerada, aguardando parecer final do gestor
  FINALIZADO          // parecer registrado e finalizedAt preenchido — visível ao colaborador
  ARQUIVADO
}

enum AuditAction {
  LOGIN
  LOGOUT
  CADASTRO
  EDICAO
  EXCLUSAO
  FEEDBACK
  FECHAMENTO
  GERACAO_IA
  GERACAO_PDF
}

// ==========================
// ENTIDADES PRINCIPAIS
// ==========================

model User {
  id            String     @id @default(uuid())
  fullName      String
  email         String     @unique
  emailVerified Boolean    @default(false)
  phone         String
  passwordHash  String
  mustChangePwd Boolean    @default(false)
  role          UserRole
  areaId        String
  area          Area       @relation(fields: [areaId], references: [id])
  positionId    String
  position      Position   @relation(fields: [positionId], references: [id])
  // Não existe mais managerId manual. O gestor de um colaborador é SEMPRE
  // derivado em runtime: usuário ativo cuja Position.isManager = true e
  // cuja areaId seja igual à do colaborador (ver PulseTeamService.getManagerFor()).
  // Isso evita inconsistência entre "cargo de gestor" e "vínculo manual" e
  // segue a regra do PRD: cargo é quem define a hierarquia, não um campo solto.
  active        Boolean    @default(true)
  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt

  feedbacksSent     Feedback[]        @relation("FeedbackSender")
  feedbacksReceived Feedback[]        @relation("FeedbackReceiver")
  pulseFeedbacksGiven    PulseFeedback[] @relation("PulseEvaluator")
  pulseFeedbacksReceived PulseFeedback[] @relation("PulseTarget")
  pulseScores       PulseScore[]
  pulseReports      PulseReport[]     @relation("ReportOwner")
  notifications     Notification[]
  auditLogs         AuditLog[]
  emailVerificationTokens EmailVerificationToken[]
  passwordResetTokens     PasswordResetToken[]
}

model Area {
  id        String     @id @default(uuid())
  name      String     @unique
  users     User[]
  createdAt DateTime   @default(now())
}

model Position {
  id        String   @id @default(uuid())
  name      String   @unique
  isManager Boolean  @default(false)   // fonte única de verdade para hierarquia de gestor
  users     User[]
  createdAt DateTime @default(now())
}

// ==========================
// TOKENS DE AUTENTICAÇÃO
// ==========================

model EmailVerificationToken {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  token     String   @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime @default(now())
}

model PasswordResetToken {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  token     String   @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime @default(now())
}

// ==========================
// FEEDBACK CONTÍNUO
// ==========================

model Feedback {
  id           String   @id @default(uuid())
  senderId     String
  sender       User     @relation("FeedbackSender", fields: [senderId], references: [id])
  receiverId   String
  receiver     User     @relation("FeedbackReceiver", fields: [receiverId], references: [id])
  text         String
  npsScore     Int      // 0-10
  createdAt    DateTime @default(now())
}

// ==========================
// FEEDBACK PULSE (CICLO 360°)
// ==========================

model PulseCycle {
  id           String            @id @default(uuid())
  label        String            // ex: "Pulse Junho/2025"
  status       PulseCycleStatus  @default(RASCUNHO)
  openedAt     DateTime?
  deadline     DateTime?
  closedAt     DateTime?
  createdAt    DateTime          @default(now())

  pulseFeedbacks PulseFeedback[]
  pulseScores    PulseScore[]
  pulseReports   PulseReport[]
}

model PulseQuestion {
  id        String   @id @default(uuid())
  order     Int
  text      String
  dimension String   // Colaboração | Confiabilidade | Comunicação | Desenvolvimento | Recomendacao(NPS)
  isNps     Boolean  @default(false)
  active    Boolean  @default(true)
  answers   PulseAnswer[]
}

model PulseFeedback {
  id           String               @id @default(uuid())
  cycleId      String
  cycle        PulseCycle           @relation(fields: [cycleId], references: [id])
  evaluatorId  String
  evaluator    User                 @relation("PulseEvaluator", fields: [evaluatorId], references: [id])
  targetId     String
  target       User                 @relation("PulseTarget", fields: [targetId], references: [id])
  type         PulseEvaluationType
  status       PulseEvaluationStatus @default(PENDENTE)
  comment      String?              // mínimo 200 caracteres, validado na API
  finishedAt   DateTime?
  createdAt    DateTime             @default(now())

  answers      PulseAnswer[]

  @@unique([cycleId, evaluatorId, targetId, type])
}

model PulseAnswer {
  id              String        @id @default(uuid())
  pulseFeedbackId String
  pulseFeedback   PulseFeedback @relation(fields: [pulseFeedbackId], references: [id])
  questionId      String
  question        PulseQuestion @relation(fields: [questionId], references: [id])
  value           Int           // 0-10
}

model PulseScore {
  id            String     @id @default(uuid())
  cycleId       String
  cycle         PulseCycle @relation(fields: [cycleId], references: [id])
  userId        String
  user          User       @relation(fields: [userId], references: [id])
  teamScore     Float      // média SOMENTE das avaliações de colegas (type=COLEGA)
  managerScore  Float      // média da avaliação do gestor (type=GESTOR)
  selfScore     Float      // média da autoavaliação (type=AUTOAVALIACAO) — EXIBIÇÃO APENAS, não entra em finalScore
  finalScore    Float      // teamScore*0.6 + managerScore*0.4  (autoavaliação NÃO pondera, conforme correção obrigatória)
  npsScore      Float
  scoreBand     String     // Excepcional | Excelente | Muito Bom | Adequado | Atenção | Crítico
  createdAt     DateTime   @default(now())

  @@unique([cycleId, userId])
}

// ==========================
// PARECER, IA E RELATÓRIO
// ==========================

model PulseReport {
  id            String            @id @default(uuid())
  cycleId       String
  cycle         PulseCycle        @relation(fields: [cycleId], references: [id])
  ownerId       String            // colaborador avaliado
  owner         User              @relation("ReportOwner", fields: [ownerId], references: [id])
  status        PulseReportStatus @default(EM_ANDAMENTO)  // status individual por colaborador/ciclo
  managerFinalOpinion String?
  finalizedById String?
  finalizedAt   DateTime?         // REGRA DE VISIBILIDADE: só com este campo preenchido
                                   // (status=FINALIZADO) o colaborador pode ver seu próprio resultado.
                                   // Antes disso, a API bloqueia o retorno para o role COLABORADOR
                                   // mesmo que ele acesse /pulse-reports/:id diretamente.
  pdfUrl        String?
  createdAt     DateTime          @default(now())

  aiAnalysis    PulseAiAnalysis?
}

model PulseAiAnalysis {
  id           String      @id @default(uuid())
  reportId     String      @unique
  report       PulseReport @relation(fields: [reportId], references: [id])
  strengths    String
  improvements String
  trends       String
  summary      String
  suggestedOpinion String
  model        String      // preenchido em runtime a partir de process.env.ANTHROPIC_MODEL, nunca hardcoded
  regenCount   Int         @default(0)
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt
}

// ==========================
// NOTIFICAÇÕES E AUDITORIA
// ==========================

model Notification {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  title     String
  message   String
  read      Boolean  @default(false)
  createdAt DateTime @default(now())
}

model AuditLog {
  id        String      @id @default(uuid())
  userId    String?
  user      User?       @relation(fields: [userId], references: [id])
  action    AuditAction
  entity    String?
  entityId  String?
  metadata  Json?
  createdAt DateTime    @default(now())
}
```

**Observações de modelagem (atualizadas na v1.1.0):**
- **Cálculo do score:** `finalScore = teamScore*0.6 + managerScore*0.4`. `selfScore` (autoavaliação) é calculado e armazenado apenas para exibição ao colaborador e ao gestor — **não entra em nenhuma ponderação do score final**, conforme correção obrigatória.
- **Hierarquia de gestor:** não existe mais FK manual de gestor no `User`. O `PulseTeamService` resolve "quem é o gestor de quem" em runtime, cruzando `areaId` do colaborador com usuários ativos cuja `Position.isManager = true` na mesma área. Isso elimina o risco de um cargo mudar para "não gestor" e o vínculo antigo continuar valendo.
- **Confirmação de e-mail / reset de senha:** `EmailVerificationToken` e `PasswordResetToken` seguem o mesmo padrão (token único, `expiresAt`, `usedAt` para invalidar reuso). O fluxo da seção 7 do PRD (esqueci senha → email → token → nova senha → alteração) passa a usar `PasswordResetToken` de ponta a ponta.
- **Status individual do relatório:** `PulseReport.status` (`PulseReportStatus`) dá visibilidade granular do progresso de cada colaborador dentro do ciclo — útil tanto para o dashboard do gestor quanto para o admin, sem precisar inferir estado a partir de outras tabelas.
- **Visibilidade do colaborador:** a API de `pulse-reports` aplica a regra de negócio no service (não só no schema): se `status !== FINALIZADO` ou `finalizedAt` nulo, qualquer tentativa de um `COLABORADOR` acessar o próprio relatório retorna 403, independentemente do que já tenha sido calculado internamente.
- **Modelo de IA via `.env`:** `ANTHROPIC_MODEL` (ex.: `claude-sonnet-4-6`) é lido pelo `PulseAiService` no momento da chamada e gravado em `PulseAiAnalysis.model` para rastreabilidade — trocar de modelo no futuro não exige alteração de código, só da variável de ambiente.
- **Admin seed:** mantido exatamente como no PRD — usuário `admin` / senha `Acesso@123`, `mustChangePwd = true`, com o front bloqueando qualquer navegação até a troca ser concluída.
- Anonimato (seção 19) é resolvido na camada de apresentação: a API nunca expõe `evaluatorId` para o `COLABORADOR` avaliado; para `GESTOR` e `ADMIN`, o nome real é retornado.
- `PulseQuestion` é parametrizável no banco (não hardcoded), permitindo evoluções futuras sem migration, mas as 5 perguntas oficiais serão seedadas exatamente como no PRD.

---

## 2. ARQUITETURA DE ROTAS (NESTJS)

Organização em módulos, seguindo Nest padrão (`Controller` → `Service` → `Repository/Prisma`).

```
src/
├── auth/
│   ├── POST   /auth/login
│   ├── POST   /auth/send-email-verification    (gera EmailVerificationToken)
│   ├── POST   /auth/verify-email/:token
│   ├── POST   /auth/forgot-password             (gera PasswordResetToken)
│   ├── POST   /auth/reset-password/:token       (valida expiresAt/usedAt)
│   └── POST   /auth/change-password             (força troca no 1º login do admin)
│
├── users/                          (Pessoas — CRUD, admin only)
│   ├── GET    /users
│   ├── GET    /users/:id
│   ├── POST   /users
│   ├── PATCH  /users/:id
│   └── DELETE /users/:id
│
├── areas/
│   ├── GET/POST/PATCH/DELETE /areas
│
├── positions/
│   ├── GET/POST/PATCH/DELETE /positions
│
├── feedbacks/                      (Feedback Contínuo)
│   ├── POST   /feedbacks                   (enviar a qualquer momento)
│   ├── GET    /feedbacks/received
│   └── GET    /feedbacks/sent
│
├── pulse-cycles/                   (Admin controla o ciclo)
│   ├── GET    /pulse-cycles
│   ├── POST   /pulse-cycles                (cria em RASCUNHO)
│   ├── PATCH  /pulse-cycles/:id/open       (ABERTO — dispara notificações)
│   ├── PATCH  /pulse-cycles/:id/close      (ENCERRADO)
│   └── PATCH  /pulse-cycles/:id/archive    (ARQUIVADO)
│
├── pulse-feedbacks/                 (avaliações individuais)
│   ├── GET    /pulse-feedbacks/pending           (do usuário logado)
│   ├── GET    /pulse-feedbacks/:id
│   ├── POST   /pulse-feedbacks/:id/answers       (salva respostas + comentário)
│   └── PATCH  /pulse-feedbacks/:id/finish
│
├── pulse-team/                      (visão do gestor)
│   ├── GET    /pulse-team/:cycleId                 (resolve gestor→time via Area + Position.isManager,
│   │                                                 depois lista status/score de cada colaborador)
│   └── PATCH  /pulse-team/:cycleId/consolidate      (EM_CONSOLIDACAO → gera PulseScore, sem ponderar selfScore)
│
├── pulse-reports/
│   ├── GET    /pulse-reports/:id                    (COLABORADOR só recebe 200 se status=FINALIZADO
│   │                                                  e finalizedAt preenchido; senão 403)
│   ├── PATCH  /pulse-reports/:id/opinion            (parecer final do gestor → status=AGUARDANDO_PARECER→FINALIZADO)
│   ├── PATCH  /pulse-reports/:id/finalize           (FINALIZADO — grava gestor/cargo/data/hora/id + finalizedAt)
│   ├── POST   /pulse-reports/:id/ai-analysis         (gera via Anthropic API, modelo lido de ANTHROPIC_MODEL)
│   ├── PATCH  /pulse-reports/:id/ai-analysis/regenerate
│   └── GET    /pulse-reports/:id/pdf                 (Puppeteer, stream do PDF; mesma regra de visibilidade)
│
├── dashboard/
│   ├── GET    /dashboard/collaborator              (score, NPS, pulse atual, evolução)
│   ├── GET    /dashboard/manager                    (time + status)
│   └── GET    /dashboard/admin                       (KPIs executivos)
│
├── notifications/
│   ├── GET    /notifications
│   └── PATCH  /notifications/:id/read
│
└── audit/
    └── GET    /audit-logs        (admin only, com filtros)
```

**Guards e permissões:**
- `JwtAuthGuard` global + `RolesGuard` (`@Roles('ADMIN' | 'GESTOR' | 'COLABORADOR')`) em cada controller.
- `pulse-team` e `pulse-reports` (parecer/finalização/IA/PDF) exigem `GESTOR` ou `ADMIN`.
- `users`, `areas`, `positions`, `pulse-cycles` (abrir/fechar) exigem `ADMIN`.
- Toda mutação relevante (login, cadastro, edição, exclusão, feedback, fechamento, geração IA, PDF) dispara `AuditLog` via interceptor global.

---

## 3. ÁRVORE DE COMPONENTES (REACT + NEXT.JS + TAILWIND + SHADCN)

```
app/
├── (public)/
│   └── page.tsx                        → Landing Page (Hero, O que é, Benefícios, Como funciona, CTA)
├── (auth)/
│   ├── login/page.tsx
│   ├── forgot-password/page.tsx
│   └── reset-password/[token]/page.tsx
│
├── (app)/                              → área autenticada, layout com Sidebar + Topbar
│   ├── layout.tsx                      → <Sidebar /> <Topbar /> <NotificationBell />
│   │
│   ├── dashboard/page.tsx              → renderiza por role:
│   │     ├── <CollaboratorDashboard />     (Score Card, NPS Card, PulseAtual Card, EvolutionChart, LastFeedbacks)
│   │     ├── <ManagerDashboard />          (TeamPulseTable, ConsolidateButton)
│   │     └── <AdminDashboard />            (ExecutiveKpis, ParticipationChart, NpsGeral)
│   │
│   ├── feedbacks/
│   │   ├── recebidos/page.tsx
│   │   ├── enviados/page.tsx
│   │   └── novo/page.tsx               → <FeedbackForm />
│   │
│   ├── pulse/
│   │   ├── page.tsx                    → <PulseSelector /> (Autoavaliação / Avaliação do Gestor / Avaliação dos Colegas)
│   │   ├── [pulseFeedbackId]/page.tsx  → <PulseWizard /> (stepper: 5 perguntas + comentário)
│   │   └── time/page.tsx               → (gestor) <TeamEvaluationTable /> + <ConsolidateModal />
│   │
│   ├── historico/page.tsx              → <ScoreHistoryChart /> <NpsHistoryChart /> <EvolutionChart />
│   │
│   ├── relatorios/
│   │   ├── page.tsx                    → lista de relatórios (gestor/admin)
│   │   └── [reportId]/page.tsx         → <ReportPreview /> <AiAnalysisPanel /> <FinalOpinionForm /> <GeneratePdfButton />
│   │
│   ├── cadastros/
│   │   ├── pessoas/page.tsx            → <PeopleTable /> <PersonFormDrawer />
│   │   ├── areas/page.tsx              → <AreasTable /> <AreaFormModal />
│   │   └── cargos/page.tsx             → <PositionsTable /> <PositionFormModal />
│   │
│   ├── ciclos-pulse/page.tsx           → (admin) <CyclesTable /> <CycleLifecycleActions />
│   ├── usuarios/page.tsx               → (admin) gestão de usuários/acessos
│   ├── configuracoes/page.tsx
│   └── perfil/page.tsx                 → <ProfileCard initials="ET" />
│
components/
├── ui/                                  → shadcn base (button, input, dialog, drawer, table, tooltip, toast, skeleton, badge)
├── shared/
│   ├── Sidebar.tsx
│   ├── Topbar.tsx
│   ├── ScoreRing.tsx                    → componente central do design system
│   ├── AvatarInitials.tsx               → substitui fotos em 100% do sistema (app + PDF)
│   ├── ProgressBar.tsx
│   ├── StatusBadge.tsx                  → mapeia PulseCycleStatus/PulseEvaluationStatus → cor
│   ├── EvolutionChart.tsx               → recharts, linha
│   ├── ScoreBarsChart.tsx               → recharts, barras horizontais (resumo de scores)
│   ├── CompositionDonut.tsx             → recharts, donut (Equipe 60% / Gestor 40%)
│   └── EmptyState.tsx
│
lib/
├── api/                                 → clients por módulo (auth, users, pulse, reports…)
├── auth/                                → JWT storage, role guard client-side
└── pdf/                                 → template HTML para Puppeteer (server-side)
```

**Design tokens** (Tailwind config, direto do PulseOne_Design_System):
```
colors: {
  'p-primary-dark': '#0F172A',
  'p-primary':      '#2563EB',
  'p-secondary':    '#0EA5E9',
  'p-success':      '#10B981',
  'p-warning':      '#F59E0B',
  'p-neutral':      '#64748B',
  'p-bg':           '#F8FAFC',
}
fontFamily: { sans: ['Inter', 'sans-serif'] }
```

---

## 3.1 VARIÁVEIS DE AMBIENTE RELEVANTES (`.env`)

```
DATABASE_URL=
JWT_SECRET=
JWT_EXPIRES_IN=

ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-6      # trocável sem deploy de código

EMAIL_VERIFICATION_TOKEN_TTL_HOURS=24
PASSWORD_RESET_TOKEN_TTL_HOURS=2

RESEND_API_KEY=
RESEND_FROM_EMAIL=                      # ex: naoresponda@pulseone.app.br
```

---

## 4. PLANO DE SPRINTS

**Sprint 0 — Fundação (infra + autenticação) ✅ concluída**
- Setup do monorepo (Next + Nest), Railway, GitHub Actions, Prisma init + migration inicial.
- Design tokens Tailwind + shadcn instalado e configurado.
- Auth completo: login, confirmação de e-mail, recuperação de senha (via `EmailVerificationToken`/`PasswordResetToken`, com TTL configurável), troca obrigatória no 1º login do admin.
- Seed: admin (`admin` / `Acesso@123`, `mustChangePwd=true`), 5 perguntas oficiais, áreas/cargos de exemplo (com ao menos um cargo `isManager=true` por área para validar a resolução dinâmica de gestor).

**Sprint 1 — Cadastros + Estrutura organizacional ✅ concluída**
- CRUD Pessoas, Áreas, Cargos (telas 2 e 3 da demo).
- Sidebar + navegação por role (menus da seção 12 do PRD).
- AvatarInitials, ScoreRing, StatusBadge, ProgressBar (componentes-base do design system).
- Isolamento por área no cadastro (seção 5) + auto-visibilidade de ADMIN/GESTOR (seção 5.6).

**Sprint 2 — Feedback Contínuo + Notificações ✅ concluída**
- Envio de feedback a qualquer momento (destinatário, texto, NPS) — **livre entre qualquer pessoa ativa da organização, sem trava de área** (diferente do Feedback Pulse, que é fechado por área — seção 5.1). Decisão confirmada com Erick.
- Sistema de notificações real: `NotificationsModule` (listar + marcar como lida) + disparo automático de notificação a cada feedback recebido (PRD seção 26). Sino funcional no Topbar com contador de não lidas.
- `GET /dashboard/collaborator` com dados reais de últimos feedbacks recebidos/enviados. Score, NPS de recomendação e evolução por ciclo continuam retornando `null`/vazio de forma explícita até o motor do Pulse (Sprint 3-5).
- Endpoint auxiliar `GET /feedbacks/recipients`, aberto a qualquer usuário autenticado (diferente de `/users`, restrito a ADMIN/GESTOR) — necessário porque o Feedback Contínuo é livre.

**Sprint 3 — Ciclo Pulse (core do produto) ✅ concluída**
- Lifecycle completo do ciclo: `PulseCyclesModule` (`create`, `open`, `close`, `consolidate`, `archive`), admin-only, com transições de estado validadas.
- `PulseAssignmentService`: gera automaticamente autoavaliação + avaliação do gestor + avaliação de colegas (todos-contra-todos), fechado por área, ao abrir o ciclo — implementação real da seção 5.1. Cria também o `PulseReport` inicial de cada colaborador e dispara notificações reais de abertura (PRD seção 26).
- `PulseFeedbacksModule`: listar pendentes/finalizadas, buscar detalhe (com as 5 perguntas oficiais), submeter respostas + comentário (mínimo 200 caracteres). Trava de segurança independente confirma `evaluator.areaId === target.areaId` a cada submissão.
- `PulseScoreService`: calcula `teamScore`, `managerScore`, `selfScore` (informativo), `finalScore = teamScore*0.6 + managerScore*0.4`, `npsScore` e `scoreBand`, disparado na consolidação do ciclo. Avança `PulseReport.status` para `AGUARDANDO_IA`.
- **Ajuste de schema**: adicionada constraint única `@@unique([pulseFeedbackId, questionId])` em `PulseAnswer`, permitindo upsert seguro de respostas.
- Frontend: seletor de avaliações (`/pulse`), wizard completo (`/pulse/[id]`, stepper de 5 perguntas + comentário com contador de caracteres), lista intermediária para múltiplos pendentes do mesmo tipo, e tela admin de Ciclos Pulse com as ações de lifecycle.
- Regras de anonimato na exibição de resultados consolidados e o bloqueio de visibilidade completo do colaborador antes de `FINALIZADO` ficam para a Sprint 4/5, quando o relatório em si é construído.

**Ajustes pós-Sprint-3 (feedback do Erick em teste real):**
- **Bug corrigido**: `GET /dashboard/collaborator` retornava `pulseAtual: null` sempre (hardcoded desde a Sprint 2). Agora consulta o ciclo `ABERTO` de verdade e retorna label, prazo e progresso (`pendentes`/`total`) do usuário logado.
- **Funcionalidade adicionada**: `GET /pulse-feedbacks/mine` — lista unificada (pendentes + finalizadas) com flag `editable` (`true` enquanto `cycle.status === ABERTO`). Tela `/pulse` reescrita para mostrar essa listagem completa, agrupada por tipo, com status visível; wizard (`/pulse/[id]`) agora suporta reabrir e editar uma avaliação já finalizada enquanto o ciclo está aberto, e vira somente-leitura automaticamente depois que o admin encerra o ciclo (o backend já bloqueava a escrita nesse caso — faltava só a UI refletir isso).
- **Confirmado como fora de escopo desta sprint**: visualização dos feedbacks recebidos de colegas/gestor com anonimato ("Colega 1/2/3") — depende do relatório consolidado, que é Sprint 4/5.

**Monitoramento em tempo real do ciclo (pedido do Erick, pulled forward das Sprints 4/5):**
- `GET /pulse-cycles/:id/progress` (ADMIN): percentual de conclusão por área + geral, do ciclo consultado. **Puramente informativo** — o sistema nunca bloqueia o encerramento do ciclo mesmo com áreas abaixo de 100% (decisão confirmada com Erick: ex. alguém de férias).
- `GET /pulse-team/current` e `GET /pulse-team/:cycleId` (GESTOR): percentual de conclusão por pessoa, escopado à própria área. O gestor vê só o "quanto falta" de cada um, nunca o conteúdo das respostas.
- Frontend: drawer "Ver Progresso" na tela de Ciclos Pulse (admin) com barra por área; tela "Avaliação do Time" (`/pulse/time`, gestor) com barra por pessoa — essa rota já estava linkada no menu desde a Sprint 1, mas sem página até agora.

### 5.7 Hierarquia de gestores diretos (pedido do Erick — substitui o modelo "um gestor por área")

**Problema identificado:** o modelo original (Sprint 1) resolvia hierarquia só por `Area + Position.isManager` — um único gestor avaliando toda a área. Isso não suporta múltiplos níveis (ex: Diretor → Gerente → Colaboradores), onde cada gestor deve avaliar **só os liderados diretos**, não a área inteira.

**Solução implementada:**
- `User.managerId` (nullable, auto-relacionamento `manager`/`directReports`) volta ao schema — é o gestor direto explícito de cada pessoa. `null` = topo da hierarquia dentro do sistema.
- **Validação no cadastro/edição** (`UsersService.resolveManagerId`): o gestor indicado precisa existir, estar ativo, ter `role=GESTOR` e ser da **mesma área** (a avaliação continua fechada por área); ninguém pode ser gestor de si mesmo; bloqueado o ciclo mais simples (A gestor de B e B gestor de A).
- **Admin nunca avalia nem é avaliado** (correção de bug confirmada): filtrado direto na consulta (`role: { not: ADMIN }`) em `PulseAssignmentService`, `getProgressByArea` e `PulseTeamService`.
- **`PulseAssignmentService.generateForCycle` reescrito:**
  - Autoavaliação: todo mundo (exceto admin), como antes.
  - **Avaliação do Gestor:** cada pessoa é avaliada só por quem está no seu `managerId` — não mais "o gestor da área avalia todo mundo".
  - **Avaliação de Colegas:** todos-contra-todos, mas só entre quem compartilha o **mesmo `managerId`** (mesmo time imediato) — decisão confirmada com Erick. Quem não tem ninguém com o mesmo gestor direto (ex: um gestor sozinho no topo) não recebe avaliação de colega nenhuma.
- **Endpoint novo:** `GET /users/managers?areaId=X&excludeUserId=Y` — lista de possíveis gestores diretos (role=GESTOR, ativos, mesma área) pro dropdown do formulário.
- **Frontend:** campo "Gestor Direto" no formulário de Cadastro de Pessoas, recarregado dinamicamente conforme a área selecionada; coluna "Gestor Direto" adicionada à tabela de Pessoas.

### 5.8 Avaliação do Gestor em mão dupla + organização por ciclo (feedback do Erick em teste real)

**Bug corrigido:** a avaliação do tipo GESTOR só era gerada em uma direção (gestor avalia liderado). Faltava a volta: o liderado também avalia o próprio gestor direto — exatamente o que a tela já sugeria ("Avaliação do Gestor — Avalie seu gestor"). `PulseAssignmentService.generateForCycle` agora gera as duas pontas para cada par `managerId`. O `PulseScoreService` já agrupa por `targetId`, então cada direção alimenta o score da pessoa certa automaticamente: a avaliação do gestor sobre o liderado conta pro `managerScore` do liderado; a avaliação do liderado sobre o gestor conta pro `managerScore` do próprio gestor (vindo de quem reporta a ele).

**Organização por ciclo:** `GET /pulse-feedbacks/mine` agora retorna `cycleId` em cada item. A tela `/pulse` passou a: mostrar só o ciclo `ABERTO` solto na tela (agrupado por tipo, como antes); qualquer ciclo que já não está mais `ABERTO` vira uma "pastinha" clicável em "Ciclos anteriores", levando pra `/pulse/ciclo/[cycleId]` (somente consulta). Extraído um componente `PulseItemsByType` compartilhado entre a tela principal e a pastinha de histórico, pra não duplicar a renderização.

### 5.9 Separação de labels do fluxo de avaliação (pedido do Erick — fecha o desenho definitivo)

O enum `PulseEvaluationType.GESTOR` (mão dupla, mesmo tipo pras duas direções) foi **separado em dois tipos distintos**, porque cada direção é uma tarefa conceitualmente diferente pra quem avalia:

- `AVALIACAO_EQUIPE` — "Avaliação da Equipe": o gestor avalia um liderado direto (descendente). Só existe pra quem tem liderados.
- `AVALIACAO_GESTOR` — "Avaliação do Gestor Direto": qualquer pessoa avalia o próprio gestor direto (ascendente). Só existe pra quem tem um `managerId` preenchido.

**Fluxo final, por perfil:**

| Colaborador (sem função de gestão) | Gestor Direto (com função de gestão) |
|---|---|
| Autoavaliação | Autoavaliação |
| Avaliação de Colegas (mesmo gestor direto) | Avaliação da Equipe (liderados diretos) |
| Avaliação do Gestor Direto (se houver) | Avaliação de Colegas (outros gestores com o mesmo gestor direto — confirmado que continua restrito ao mesmo time imediato, não toda a área) |
| | Avaliação do Gestor Direto (se houver) |

**Scoring inalterado:** `PulseScoreService` soma `AVALIACAO_EQUIPE` e `AVALIACAO_GESTOR` no mesmo balde de `managerScore` de quem está sendo avaliado — é o "score recebido na linha hierárquica direta", venha de cima (chefe) ou de baixo (liderado). A fórmula `finalScore = teamScore*0.6 + managerScore*0.4` não mudou.

### 5.10 Correção de crash — migração de enum com dados de teste existentes

**Causa raiz:** ao dividir `PulseEvaluationType.GESTOR` em `AVALIACAO_EQUIPE`/`AVALIACAO_GESTOR` (seção 5.9), já existiam linhas de teste em `PulseFeedback` com `type='GESTOR'` no banco (dos testes anteriores do Erick). O Postgres não consegue migrar automaticamente um enum removendo um valor que ainda está em uso — `prisma db push` entrava em loop de crash (`invalid input value for enum`).

**Correção:** `backend/prisma/fix-legacy-enum.js` — script em SQL bruto (via `pg`, não via Prisma Client, já que o client gerado nem reconhece mais o valor antigo) que remove as linhas de teste com `type='GESTOR'` **antes** do `db push` rodar. Chamado automaticamente pelo `start.js`. Idempotente e seguro rodar em todo boot (não faz nada se a tabela não existir ou já estiver limpa).

⚠️ **Nota para o futuro:** essa é uma correção pontual pra este caso específico. Qualquer mudança futura de enum que remova um valor já em uso por dados existentes vai precisar de um fixup parecido, feito sob medida — não é algo que dá pra automatizar de forma genérica sem saber pra onde cada dado antigo deveria migrar.

**Sprint 4 — Consolidação do Gestor + IA**
- Tela "Avaliação do Time" (tela 4) + consolidação.
- Integração Anthropic API para geração de análise (pontos fortes/melhoria/tendências/parecer sugerido), com persistência e regeneração.
- Parecer final do gestor + fechamento com registro (gestor/cargo/data/hora/id).

**Sprint 5 — Relatório PDF + Dashboards executivos**
- Template HTML do relatório (tela 5) + geração via Puppeteer.
- Dashboard Admin completo (tela 4 — participação, pendências, NPS médio, score médio).
- Histórico com gráficos de evolução.

**Sprint 6 — Landing Page + Auditoria + QA final**
- Landing page pública (seção 10).
- Log de auditoria completo + tela de consulta (admin).
- QA obrigatório integral (seção 27): lint, typecheck, build, responsividade, acessibilidade, testes unit/integration/API/permissions/migration, segurança (JWT, hash, CSRF, SQL injection, XSS), regressão.
- Empacotamento: changelog, versão, relatório QA, tabela de arquivos alterados, ZIP, instruções GitHub e Railway.
- **Reset pré-lançamento (checklist obrigatório antes de qualquer uso real — pedido explícito do Erick):** rodar um script de limpeza definitivo, executado uma única vez, que apaga *todos* os dados de teste — pessoas (exceto o cadastro do admin), áreas, cargos, feedbacks contínuos, ciclos Pulse, avaliações, relatórios, notificações e audit logs — deixando o banco só com o admin e as 5 perguntas oficiais (que são fixas do PRD, não teste). O script será protegido por confirmação explícita (ex: variável de ambiente `CONFIRM_RESET=yes-i-am-sure` exigida para rodar), justamente para não haver risco de disparo acidental em produção com dados reais depois do lançamento. A construir junto com o fechamento da Sprint 6, ou antes, se preferir.

---

## 5. ISOLAMENTO POR ÁREA (v1.2.0)

### 5.1 Feedback fechado por área — `PulseAssignmentService` (a construir na Sprint 3)

Quando o admin muda um `PulseCycle.status` para `ABERTO`, este service roda automaticamente e gera todas as `PulseFeedback` do ciclo, com as seguintes regras:

```
Para cada Area com colaboradores ativos:
  membros = usuários ativos daquela area

  // AUTOAVALIAÇÃO — sempre, individual
  para cada membro em membros:
    criar PulseFeedback(type=AUTOAVALIACAO, evaluator=membro, target=membro)

  // AVALIAÇÃO DO GESTOR — o gestor da área avalia cada membro (exceto ele mesmo)
  gestor = resolver gestor da area (Position.isManager = true, mesma areaId)
  se existir gestor:
    para cada membro em membros, membro != gestor:
      criar PulseFeedback(type=GESTOR, evaluator=gestor, target=membro)

  // AVALIAÇÃO DE COLEGAS — todos-contra-todos, SOMENTE dentro da mesma área
  se membros.length >= 2:
    para cada par (A, B) em membros, A != B:
      criar PulseFeedback(type=COLEGA, evaluator=A, target=B)
  // área com 1 pessoa só: não gera avaliação de colega (não há com quem comparar)
```

**Trava de segurança na API** (independente da geração automática): o `PulseFeedbackService` rejeita com 403 qualquer tentativa de submeter uma avaliação onde `evaluator.areaId !== target.areaId` — mesmo em caso de bug na geração automática ou requisição manual forjada, o isolamento por área nunca é contornável pela API.

### 5.2 Dashboard do gestor com evolução da área (a construir na Sprint 5, contrato já fechado)

`GET /dashboard/manager` (sempre implicitamente filtrado por `areaId` do gestor logado — nunca aceita parâmetro de área vindo do client) passa a retornar:

```
{
  areaAtual: {
    nome, totalColaboradores, pulseAtivo, pendentes
  },
  time: [
    { userId, nome, statusCicloAtual, scoreAtual, npsAtual }
  ],
  evolucaoDaArea: [
    { ciclo: "Junho/2025", scoreMedio, npsMedio, participacaoPercentual },
    { ciclo: "Setembro/2025", scoreMedio, npsMedio, participacaoPercentual }
  ]
}
```

`evolucaoDaArea` é calculado agregando `PulseScore` de todos os ciclos `FINALIZADO`/`ARQUIVADO` da área — dá ao gestor a visão de tendência (a área está melhorando ou piorando ciclo a ciclo), não só a fotografia do momento atual.

### 5.3 Cadastro pelo gestor restrito à própria área — **implementado nesta rodada**

`UsersModule` (`backend/src/users/users.module.ts`) foi reescrito com:

- `@Roles(ADMIN, GESTOR)` em todas as rotas de `/users` (antes só `ADMIN`).
- `UsersService.resolveAreaId()`: se quem cria/edita é `GESTOR`, a área é **sempre** a dele próprio — qualquer `areaId` vindo no corpo da requisição é ignorado nesse caso. Só `ADMIN` pode escolher livremente a área.
- `UsersService.findAll()` / `findOne()`: `GESTOR` só enxerga pessoas da própria área (`where: { areaId: requester.areaId }`); tentativa de acessar `/users/:id` de outra área retorna 403.
- `update()` / `remove()`: mesma trava — gestor não edita/inativa ninguém fora da própria área, e não pode mover alguém de área por essa rota.

### 5.4 `role` derivado do cargo — **implementado nesta rodada**

`UsersService.resolveRole()` centraliza a decisão:

- `asAdmin=true` no payload **só tem efeito se quem está criando já é `ADMIN`** — caso contrário, `ForbiddenException`.
- Caso contrário, o `role` é sempre `GESTOR` ou `COLABORADOR`, decidido automaticamente por `Position.isManager` do cargo escolhido — nunca escolhido livremente no formulário.
- Isso elimina de vez a possibilidade de uma pessoa ficar com cargo "Analista" (`isManager=false`) mas `role=GESTOR` (ou vice-versa) por erro de preenchimento.

### 5.5 Consequência para o frontend (Sprint 1)

No formulário de "Cadastrar Pessoa": quando quem está logado é `GESTOR`, o campo **Área** vem pré-preenchido com a própria área e **desabilitado** (`disabled`) — não é só uma sugestão de UX, é reforço visual de uma regra que o backend já impõe de qualquer forma. Quando é `ADMIN`, o campo continua livre.

### 5.6 Auto-visibilidade de ADMIN / acesso total do ADMIN a GESTOR — **implementado nesta rodada**

Regra de privacidade final:

- **Cadastro de `ADMIN`**: só a própria pessoa pode ver/editar — ninguém mais, nem sequer outro admin.
- **Cadastro de `GESTOR`**: só o próprio gestor **ou o `ADMIN`** podem ver/editar. Nenhum outro gestor, nem colaborador, tem acesso.
- **Cadastro de `COLABORADOR`**: `ADMIN` vê/edita qualquer um, de qualquer área; `GESTOR` vê/edita só os da própria área.

Implementação:
- `UsersService.findAll()`: quando quem lista é `ADMIN`, retorna `COLABORADOR` + `GESTOR` de todas as áreas **e também o próprio cadastro do admin** (nunca o de outro `ADMIN`, se existir mais de um). Quando é `GESTOR`, retorna `COLABORADOR` + o próprio cadastro de `GESTOR`, só da própria área.
- `UsersService.assertCanAccessTarget()`: usado em `findOne`, `update` e `remove` — bloqueia acesso a registros `ADMIN` de terceiros sempre; bloqueia acesso a registros `GESTOR` a menos que o requisitante seja o próprio gestor ou um `ADMIN`; aplica escopo por área normalmente para alvos `COLABORADOR`.
- **Consequência prática**: o `ADMIN` consegue resolver qualquer problema de cadastro de um gestor (trocar cargo, área, dados) diretamente pela tela de Pessoas. Só o próprio cadastro do administrador fica fora do alcance de qualquer edição por terceiros — inclusive de outro admin, se existir mais de um.

---

## PRÓXIMO PASSO SUGERIDO

Com as 7 correções obrigatórias da v1.1.0 e as 4 correções de isolamento por área da v1.2.0 aplicadas — sendo as duas últimas (cadastro restrito à área e role derivado do cargo) já implementadas e entregues em código —, este documento está pronto para validação final.

Após seu aceite, o próximo movimento é o **Sprint 0**: setup do projeto (estrutura de pastas real, `schema.prisma` rodando com as tabelas revisadas, autenticação com verificação de e-mail e reset de senha funcionais) antes de tocar em qualquer tela visual.

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
  AGUARDANDO_FECHAMENTO // encerrado, score calculado — aguardando o gestor consolidar (IA opcional + parecer)
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
│   ├── PATCH  /pulse-reports/:id/opinion            (parecer final do gestor → status=AGUARDANDO_FECHAMENTO→FINALIZADO)
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
- `PulseScoreService`: calcula `teamScore`, `managerScore`, `selfScore` (informativo), `finalScore = teamScore*0.6 + managerScore*0.4`, `npsScore` e `scoreBand`, disparado na consolidação do ciclo. Avança `PulseReport.status` para `AGUARDANDO_FECHAMENTO`.
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

### 5.11 Dashboard do Admin — widgets irrelevantes escondidos (interino até a Sprint 5)

**Achado do Erick:** o Admin via a mesma tela de dashboard do colaborador comum, incluindo "Meu Score Atual" e "Pulse Atual" — nenhum dos dois se aplica ao admin, já que ele nunca é avaliado (seção 5.7). Também apareceu uma notificação antiga de "ciclo aberto — avaliações pendentes" pro admin, mas isso era só resquício de um teste anterior à correção da seção 5.7 (novos ciclos não geram mais essa notificação pro admin).

**Correção:** `dashboard/collaborator` não calcula mais `pulseAtual` quando quem pede é `ADMIN` (nem consulta o ciclo ativo à toa). No frontend, os cards "Meu Score Atual" e "Pulse Atual" ficam ocultos pro admin, mostrando só "Área" + a nota de que o Dashboard Executivo completo (participação, pendências, NPS médio, score médio por área) chega na Sprint 5. O bloco de Feedback Contínuo (recebidos/enviados) continua aparecendo pro admin normalmente — essa parte é livre pra qualquer pessoa da organização, admin incluído.

**Sprint 4 — Consolidação do Gestor + IA ✅ concluída**
- `AnthropicService`: gera a análise (pontos fortes, melhoria, tendências, resumo, parecer sugerido) via Anthropic API real (`fetch` puro, sem SDK), modelo lido de `ANTHROPIC_MODEL`. Fallback textual se a API key não estiver configurada ou a chamada falhar — nunca derruba o fluxo.
- `PulseReportsModule`: consolidação completa —
  - `GET /pulse-reports` (gestor, seus liderados diretos) / `GET /pulse-reports/all` (admin, todos) / `GET /pulse-reports/mine` (qualquer um, os próprios) / `GET /pulse-reports/:id` (detalhe, com regra de visibilidade e anonimato aplicadas).
  - `PATCH /pulse-reports/:id/ai-analysis` — gera/regenera a análise, não muda o status (fica em `AGUARDANDO_FECHAMENTO` até o parecer ser finalizado).
  - `PATCH /pulse-reports/:id/opinion` — salva o parecer final (rascunho, pode ser salvo várias vezes antes de finalizar).
  - `PATCH /pulse-reports/:id/finalize` — exige parecer preenchido, grava `finalizedById` + `finalizedAt`, muda status para `FINALIZADO`.
- **Anonimato aplicado de verdade** (PRD seção 19, estendido pra hierarquia): quem vê o **próprio** relatório enxerga colegas como "Colega 1/2/3" e liderados (se for gestor) como "Liderado 1/2/3" — só o gestor direto aparece com nome real. Gestor/Admin consolidando veem todo mundo com nome real.
- **Quem consolida:** só o gestor direto do dono do relatório (ou admin) — o próprio dono nunca gera IA, escreve parecer ou finaliza o próprio relatório, mesmo que ele seja gestor de outras pessoas.
- Frontend: `/relatorios` (lista, por perfil), `/relatorios/[id]` (capa com score, NPS, barras de composição, comentários, painel de IA, parecer final + botão Finalizar), `/historico` (colaborador vê os próprios ciclos — só abre o relatório completo se `FINALIZADO`).

### 5.12 Liberação em lote por área (pedido do Erick — fecha o desenho da consolidação)

**Problema identificado:** o desenho original liberava cada `PulseReport` individualmente assim que o gestor finalizava aquele parecer específico — o que permitia alguém ver o próprio resultado antes de colegas da mesma área, possibilitando troca de informação indevida antes de todo mundo estar pronto.

**Correção:**
- `PulseReportsService.isAreaFullyConsolidated(cycleId, areaId)`: verifica se **todos** os `PulseReport` daquela área, naquele ciclo, estão `FINALIZADO`. A visibilidade do colaborador pro próprio relatório agora exige as duas condições: o relatório dele estar `FINALIZADO` **e** a área inteira estar consolidada — nunca antes disso.
- **Nova ação de ciclo**: `PATCH /pulse-cycles/:id/finalize` (admin, como as demais ações de ciclo) — transiciona `EM_CONSOLIDACAO → FINALIZADO`. Diferente do encerramento das avaliações (que é só informativo), esta ação tem **bloqueio real**: exige 100% dos relatórios de **todas** as áreas finalizados, senão retorna erro explicando quantos faltam.
- **Consolidação por área é independente**: cada área finaliza seus relatórios no próprio ritmo — não precisa esperar as outras áreas pra a área X ficar liberada pros seus colaboradores. O que exige 100% global é só a transição do **ciclo inteiro** pra `FINALIZADO` (ação do admin), não a liberação individual por área.
- `GET /pulse-cycles/:id/consolidation-progress` (admin): mesmo formato do `progress` (avaliação), mas medindo `PulseReport.status` — permite o admin ver quantas áreas já estão prontas antes de tentar finalizar o ciclo inteiro.
- Frontend: tela de Ciclos Pulse ganhou "Ver Consolidação" (progresso por área na fase de parecer, agora com os **nomes de quem está pendente**, não só a contagem) e o botão "Finalizar Ciclo" quando `EM_CONSOLIDACAO`; tela de Relatórios do gestor ganhou uma barra de progresso do próprio time.

### 5.13 Topo da hierarquia não precisa de parecer final (pedido do Erick)

**Regra:** quem está no topo da hierarquia (`managerId = null`, ex: um Diretor sem ninguém acima no sistema) não precisa de parecer final escrito por ninguém — ele só precisa ver as avaliações que o próprio time deu sobre ele. Faz sentido: não há quem escreva esse parecer, já que ninguém está numa posição hierárquica acima dele.

**Implementação:**
- `PulseScoreService.computeForCycle`: ao calcular o score de alguém sem `managerId`, o `PulseReport` já sai direto como `FINALIZADO` (com `finalizedAt` preenchido) — pulando `AGUARDANDO_FECHAMENTO` inteiramente, sem depender de nenhuma ação manual do admin.
- `PulseReportsService.finalize()`: segunda camada de segurança — só exige `managerFinalOpinion` preenchido se `owner.managerId !== null`.
- `GET /pulse-reports/:id` retorna `requiresOpinion: boolean`, e o frontend usa isso pra esconder completamente o painel de "Parecer Final do Gestor" nesses casos, mostrando só uma nota explicando a liberação automática — a seção de "Feedbacks Recebidos" (com os comentários da equipe) continua aparecendo normalmente.

### 5.14 Correções de visibilidade prematura e cálculo de score sem par (feedback do Erick em teste real)

**Bug 1 — gestor via o próprio relatório antes da hora:** `assertCanAccessReport` liberava acesso pra um `GESTOR` que fosse dono (`isOwner`) do relatório sem checar status nem consolidação da área — a trava só existia pro `COLABORADOR`. Corrigido extraindo `assertSelfViewReady()`, usada agora pelos dois papéis quando a pessoa está vendo o PRÓPRIO relatório: exige `status=FINALIZADO` **e** área inteira consolidada, sem exceção — inclusive pra quem está no topo da hierarquia (o relatório dele finaliza sozinho, mas ainda espera a área toda antes de ficar visível pra ele mesmo).

**Bug 2 — score injusto quando falta uma vertical:** se `colegaScores` ou `gestorScores` vier vazio (ex: um gestor sem par de mesmo nível pra receber avaliação de colega), a média daquela vertical é `0` por falta de dado — mas a fórmula fixa `teamScore*0.6 + managerScore*0.4` tratava esse `0` como nota real, derrubando o `finalScore` injustamente. Corrigido: o peso é redistribuído dinamicamente — se só uma vertical tem dado, ela recebe 100% do peso; só quando as duas têm dado é que volta ao 60/40 padrão.

**Sprint 5 — Relatório PDF + Dashboards executivos ✅ (parte 1 concluída nesta rodada)**
- **PDF do relatório**: `PulseReportPdfService` — template HTML próprio (sem depender de React/recharts no backend, só HTML/CSS/SVG puro) + Puppeteer headless (`--no-sandbox`, necessário em containers). Reaproveita 100% a lógica de permissão e anonimato do `findOne()` — o PDF nunca mostra mais do que a pessoa já veria na tela. Rota `GET /pulse-reports/:id/pdf`, botão "Baixar PDF" na tela de relatório (só aparece quando `FINALIZADO`). Rodapé "Versão 1.0.0 • Desenvolvido por BellePlanner" já incluso, fechando a pendência que faltava desde a decisão de branding.
- **Score/NPS/Evolução do colaborador conectados de verdade**: `dashboard/collaborator` deixou de retornar `null` fixo — calcula a partir de `PulseScore`, respeitando a mesma trava de liberação em lote por área (seção 5.12) usada no relatório completo. `/historico` ganhou gráfico de evolução (recharts, `LineChart`) quando há 2+ ciclos liberados.
- **Dashboard do ADMIN**: `GET /dashboard/admin` — áreas, cargos, pessoas por área, pulsos cadastrados, pulso vigente, participação % e pendências do ciclo ativo. Nada de NPS/score, como combinado.
- **Dashboard do GESTOR**: `GET /dashboard/manager` — score médio e NPS médio da equipe (liderados diretos, ciclo mais recente finalizado/arquivado), quantidade de membros + listagem com nomes e cargos. (Nota: como `managerId` exige mesma área do gestor — seção 5.7 —, o cenário "gestor de várias áreas" que o Erick mencionou não é possível na arquitetura atual; fica registrado caso vire um requisito real no futuro.)
- **Pendente ainda nesta sprint**: Landing Page (isso é Sprint 6).

### 5.16 Sprint 6 — parte 1: Autocadastro, Admin sem departamento, Reset gated e Manual do Usuário

**Autocadastro público (pedido do Erick):** `POST /auth/register` — o funcionário cria a própria conta sem depender de admin/gestor. Escolhe livremente área e cargo (o `role` continua sendo derivado do cargo, nunca escolhido livremente, e nunca pode virar ADMIN por essa via). Dispara o e-mail de verificação automaticamente (fluxo que existia desde a Sprint 0, mas nunca tinha sido conectado a um cadastro real até agora). Rotas públicas novas (`/public/areas`, `/public/positions`, `/public/managers`) alimentam os selects do formulário antes da pessoa ter conta. Tela `/cadastro` (fora do layout autenticado) + link "Cadastre-se" na tela de login.

**Admin não pertence a nenhum departamento (correção de schema):** `User.areaId`/`positionId` passaram de obrigatórios para opcionais — só o ADMIN fica sem os dois (é uma entidade do sistema, não um colaborador da organização). Seed atualizado pra corrigir isso retroativamente em qualquer admin já existente. Todos os pontos do código/frontend que assumiam área/cargo sempre presentes foram ajustados pra lidar com `null` (login, Topbar, Meu Perfil, tabela de Pessoas).

**Reset pré-lançamento — construído, nunca executado automaticamente (pedido explícito do Erick):** `POST /admin-tools/reset-test-data` (ADMIN + frase de confirmação exata `CONFIRMO-APAGAR-TODOS-OS-DADOS-DE-TESTE` **+ senha MASTER**, a mesma variável usada na liberação de e-mail duplicado — seção 5.17) apaga todos os dados de teste (pessoas exceto admin, áreas, cargos, ciclos, feedbacks, relatórios, notificações, tokens, audit log) em ordem segura de dependência — preserva o(s) admin(s) e as 5 perguntas oficiais. Exposto na tela **Configurações → Zona de Perigo** (admin only): digita a frase pra habilitar o botão, que abre um modal pedindo a senha MASTER — as duas travas precisam bater, e se a senha MASTER não estiver configurada no servidor, o reset fica bloqueado por padrão. Não é chamado por nenhum fluxo automático — só executa se o próprio Erick disparar pela tela, quando estiver pronto.

**Manual do Usuário:** botão no Topbar (`/manual`), com seções expansíveis em linguagem não técnica, organizadas por perfil (todo mundo vê os tópicos gerais; gestor e admin veem seções extras). Usa diagramas ilustrativos simples (não prints reais — sem acesso de navegador ao domínio em produção pra capturar telas de verdade; se o Erick quiser, dá pra substituir por prints reais depois).

### 5.17 E-mail duplicado com liberação por senha MASTER (pedido do Erick)

**Cenário real identificado:** a mesma pessoa pode legitimamente precisar de mais de uma conta com o mesmo e-mail (ex: é admin do sistema e também gestor de uma área específica).

**Mudança de arquitetura:** `User.email` deixou de ser `@unique` no banco (virou só um índice, `@@index([email])`, pra manter a performance das buscas). Isso exige que o login soubesse lidar com múltiplas contas por e-mail:
- **Login**: busca **todas** as contas ativas com aquele e-mail e testa a senha contra cada uma (`bcrypt.compare` em loop) — a primeira que bater com a senha digitada é a conta usada. Ou seja, **a senha desempata**: contas diferentes da mesma pessoa devem ter senhas diferentes.
- **Autocadastro público**: continua bloqueando e-mail duplicado sempre, sem exceção — a liberação por senha MASTER é exclusiva do cadastro feito por admin/gestor (não faz sentido um desconhecido se autocadastrando ter acesso a essa liberação).
- **Cadastro/edição pelo admin/gestor** (`UsersService.assertEmailAvailable`): se o e-mail já existe, exige `masterPasswordOverride` no corpo da requisição, comparado contra a variável de ambiente `MASTER_PASSWORD`. Sem a variável configurada no servidor, a liberação fica desabilitada por padrão (erro claro, não deixa passar silenciosamente).
- **Frontend**: tela de Pessoas detecta o erro `EMAIL_JA_EXISTE` e abre um modal pedindo a senha MASTER — se confirmar certo, o cadastro segue normalmente; se clicar em "Não tenho a senha master", fecha o modal com o aviso pra usar outro e-mail.
- **Limitação conhecida, aceita por ora**: o fluxo de "Esqueci minha senha" usa a primeira conta encontrada com aquele e-mail, caso existam duas — cenário raro o suficiente pra não justificar mais complexidade agora.

### 5.18 Correção de build — propagação de `areaId`/`positionId` opcionais

Tornar `areaId`/`positionId` opcionais no schema (seção 5.16) quebrou o build real no Railway: 10 erros de tipo em `dashboard.module.ts`, `pulse-reports.module.ts` e `users.module.ts`, todos do mesmo tipo — código que ainda assumia `areaId: string` (não-nulo) em assinaturas de função e no tipo `AuthUser`, usado em quase todos os módulos.

**Correção:** `type AuthUser` (declarado localmente em 7 módulos) passou a aceitar `areaId: string | null`; `assertCanAccessTarget`, `assertCanAccessReport`, `assertSelfViewReady`, `resolveAreaId`, `resolveManagerId` e `getCollaboratorDashboard` ajustados com guardas explícitas (`if (!areaId) throw/continue`) nos pontos onde a ausência de área realmente não deveria acontecer na prática (admin nunca participa de Pulse/hierarquia), mas o TypeScript precisa da garantia explícita mesmo assim.

⚠️ **Nota de transparência:** esses 10 erros só apareceram no build real do Railway — o ambiente local usado pra QA aqui não tem o Prisma Client gerado de verdade (sem acesso de rede pro binário do Prisma), então os tipos derivados do schema (como a nulidade de `areaId`) não são verificáveis localmente com precisão total. A correção foi feita por raciocínio cuidadoso sobre cada mensagem de erro exata do log, mas a validação definitiva só acontece no próximo build do Railway.

**Correção pós-entrega — PDF falhando com 500 em produção:**
O `puppeteer` "completo" baixa um Chromium que depende de várias bibliotecas de sistema (libnss3, libatk, etc.) normalmente ausentes em containers mínimos como o do Railway — causa mais comum de PDF quebrar exatamente em produção (funciona local, falha no deploy). Trocado por **`puppeteer-core` + `@sparticuz/chromium`**: um Chromium estático, compilado especificamente pra rodar em containers/serverless sem essas dependências extras. Também adicionado logging real do erro (`Logger.error` com stack trace) — antes, qualquer falha do Puppeteer virava só um 500 genérico sem rastro nenhum no log.

**Causa raiz real, encontrada graças ao logging acima:** `Cannot read properties of undefined (reading 'args')` — o `tsconfig.json` do backend tinha `allowSyntheticDefaultImports: true` mas **não** tinha `esModuleInterop: true`. O primeiro só afeta checagem de tipos; o segundo é o que de fato muda o JavaScript gerado (via helper `__importDefault`) pra desembrulhar corretamente o `import x from 'pacote-commonjs'` em tempo de execução. Corrigido — confirmado no próprio JS compilado.

**Segunda causa raiz, depois de corrigir a primeira:** `libnss3.so: cannot open shared object file` — mesmo o Chromium "enxuto" do `@sparticuz/chromium` ainda depende de bibliotecas de sistema (NSS) que o container do Railway não tem instaladas por padrão.

**Terceira causa raiz — descoberta ao pedir o log de BUILD (não só o de deploy):** a primeira tentativa de correção (via `nixpacks.toml`) simplesmente não foi aplicada, porque **o Railway não usa mais Nixpacks** — o log de build mostrou `using build driver railpack-v0.30.0`. **Railpack** é o builder novo do Railway (sucessor do Nixpacks), com config própria: **`railpack.json`**, não `nixpacks.toml`. Campo usado: `deploy.aptPackages` — instala pacotes `apt` no ambiente de **execução** (não só build), essencial já que a geração de PDF acontece em runtime. `railpack.json` (novo, raiz do repo) instala `"chromium"` via apt — o apt resolve toda a árvore de dependências (libnss3 incluso) automaticamente, sem precisar listar cada biblioteca manualmente. `PulseReportPdfService.resolveChromiumPath()` (`which chromium` / `chromium-browser` / etc.) encontra o binário instalado, seja qual for o nome que a distribuição usar.

⚠️ **Lição para o futuro:** ao usar qualquer configuração de build/infra específica de uma ferramenta (Nixpacks, Docker, etc.), vale confirmar primeiro qual builder o Railway está usando de fato (visível no log de **build**, não no de deploy/runtime) — os dois logs mostram informações bem diferentes, e o log de build é o único que revela se a configuração de infraestrutura foi realmente reconhecida.

**Quarta camada — Chromium encontrado e iniciando, mas travando em D-Bus/crashpad:** com o `libnss3` resolvido, o Chromium passou a ser localizado e começar a subir, mas travava com `Failed to connect to the bus` (D-Bus) e erros do crash reporter (`crashpad`) tentando ler arquivos de `/sys/devices/...` que não existem no container restrito do Railway. Adicionado um conjunto mais completo de flags de lançamento do Chromium (`--disable-breakpad` etc.) — mas os mesmos avisos continuaram aparecendo mesmo com as flags novas, indicando que são só **ruído inofensivo** do Chromium nesse tipo de ambiente, não a causa real da falha.

**Quinta camada — timeout/diretório de perfil:** adicionado `timeout: 60_000`, `userDataDir` único por chamada e `dumpio: true` (pra ecoar a saída do Chromium em tempo real). O `dumpio` revelou algo importante: o Chromium crashava em **menos de 150ms** depois de iniciar — não era timeout, então essa hipótese estava errada.

**Sexta camada, e correção final:** um crash quase instantâneo (100-150ms), sem mensagem de erro clara além do ruído de D-Bus/crashpad, é a assinatura clássica de **incompatibilidade de protocolo** entre o `puppeteer-core` (que espera uma versão bem específica do Chromium) e o Chromium genérico instalado via `apt` (versão do repositório Debian, sem garantia de casar com o que o Puppeteer espera). **Correção definitiva — estratégia combinada:**
- Mantido o `railpack.json` instalando `chromium` via apt — não para usar esse binário, mas porque ele traz as **bibliotecas compartilhadas** (libnss3 e outras) que qualquer Chromium no sistema precisa, incluindo o do Puppeteer.
- Trocado `puppeteer-core` de volta para **`puppeteer` completo** — ele baixa e usa o **próprio Chromium**, testado e casado exatamente com essa versão do Puppeteer, eliminando o risco de incompatibilidade de protocolo. Como as bibliotecas do sistema já estão presentes (via apt), esse Chromium bundled agora tem tudo que precisa pra rodar.
- `resolveChromiumPath()` (busca manual via `which`) foi removida — não é mais necessária, o `puppeteer` resolve o próprio binário sozinho.

**Dashboard do ADMIN (escopo fechado com o Erick — só administração do sistema, nada de NPS/score):**
- Quantidade de áreas cadastradas
- Quantidade de cargos cadastrados
- Quantidade de pessoas cadastradas por área
- Quantidade de pulsos (ciclos) cadastrados
- Último pulso vigente (ciclo ativo no momento)
- Quantidade de participação de pessoas nos pulsos
- Quantidade de pendências
- **Não entra**: NPS médio, score médio — isso é papel do gestor, não do admin.

**Dashboard do GESTOR (escopo fechado com o Erick — adiciona à visão executiva da própria gestão):**
- NPS médio da equipe de gestão
- Score médio — por área, se o gestor gerenciar mais de uma área; senão, score médio da área única que ele gerencia
- Mantém o que já existe hoje: últimos feedbacks recebidos/enviados (contínuos), quantidade de participação nos pulsos
- Quantidade de membros da equipe + **listagem** dos nomes dessa equipe

**Ajuste imediato no Dashboard do ADMIN (implementado nesta rodada, antes da Sprint 5):** o admin não é vinculado a nenhuma área de verdade (a área/cargo no cadastro dele é só um artefato técnico do schema) — por isso o card "Área", o botão "Enviar Feedback" e as seções "Últimos Feedbacks Recebidos/Dados" foram escondidos do dashboard do admin. Ele vê só a saudação + a nota de que o Dashboard Executivo chega na Sprint 5.

**Pendências combinadas para a Sprint 5 (arquivamento de ciclo — decisão do Erick):** hoje "Arquivar" só troca `PulseCycle.status` para `ARQUIVADO`, sem mais nenhum efeito (nada se move, nada se apaga, ninguém perde acesso). Combinado de deixar assim por enquanto e resolver tudo junto quando o Puppeteer estiver pronto:
- Conectar o `AuditLog`/`AuditInterceptor` (existem desde a Sprint 0, mas nunca foram ligados às ações reais do ciclo) às 5 ações do ciclo (`open`, `close`, `consolidate`, `finalize`, `archive`) — quem fez, quando, qual ciclo.
- Adicionar `archivedAt DateTime?` em `PulseCycle` (mesmo padrão de `openedAt`/`closedAt`), preenchido no momento do arquivamento.
- Fazer "Arquivar" disparar a geração automática do PDF final de todo mundo daquele ciclo — só faz sentido depois que o Puppeteer existir, transformando o arquivamento num encerramento de verdade (com artefato final gerado), em vez de só uma troca de rótulo.

### 5.19 Alterar senha — self-service para todos, redefinição só para o Admin (pedido do Erick)

- **Todo mundo troca a própria senha**: tela **Meu Perfil** ganhou uma seção "Alterar Senha", usando o endpoint que já existia desde a Sprint 0 (`POST /auth/change-password`) mas nunca tinha interface — exige a senha atual + a nova.
- **Só o ADMIN redefine a senha de qualquer pessoa**: novo endpoint `PATCH /users/:id/password` (`SetPasswordDto`), restrito a `@Roles(ADMIN)` no controller **e** checado de novo dentro do service (defesa em profundidade) — nem o gestor tem essa ação, mesmo podendo editar outros campos de quem está na própria área. Não exige a senha atual (é uma ação autorizada pelo papel, não pelo conhecimento da senha antiga), e força `mustChangePwd=true` — a pessoa é obrigada a trocar essa senha temporária no próximo login. Exposto na tela de Cadastro de Pessoas, numa seção separada do formulário principal, visível só quando quem está logado é admin.

### 5.20 Correção — seed.ts quebrava após e-mail deixar de ser único

Ao remover `@unique` do e-mail (seção 5.17), o `seed.ts` continuou usando `upsert({ where: { email: '...' } })` pra criar/atualizar o admin — o Prisma exige um campo `@unique` (ou `id`) pra esse tipo de busca, e o e-mail deixou de servir. Isso travava o container em loop de crash logo no passo do seed. Corrigido: `findFirst({ where: { email, role: ADMIN } })` + `create`/`update` manual por `id`, em vez de `upsert` por e-mail.

### 5.21 Incidente — admin travado após edição do próprio cadastro (correção pontual + prevenção)

**O que aconteceu:** o Erick editou o próprio cadastro do admin (trocando e-mail pra igual ao do gestor, de teste) e preencheu a "Redefinir Senha" — mas clicou em **Salvar** (formulário principal) em vez de **Redefinir senha desta pessoa** (ação separada, de propósito, pra não misturar os dois envios). Resultado: o e-mail mudou, a senha não, e ele ficou sem saber com qual credencial entrar.

**Recuperação pontual (execução única):** `backend/prisma/fix-admin-recovery.js`, chamado uma vez pelo `start.js` **antes** do seed, força o e-mail e a senha do admin de volta pros valores corretos direto no banco — não depende de conhecer a senha atual. ⚠️ Essa chamada precisa ser **removida do `start.js`** assim que o Erick confirmar que voltou a conseguir logar — senão resetaria o e-mail/senha do admin em todo deploy futuro, mesmo que ele troque essas credenciais de propósito depois.

**Correção relacionada no seed:** o `seed.ts` identificava o admin pelo e-mail padrão (`admin@pulseone.app.br`) — se o e-mail fosse customizado (como o Erick fez, e é esperado que continue fazendo), o seed não encontraria o admin existente e criaria **um segundo do zero**. Corrigido: identifica o admin só pelo `role=ADMIN`, nunca mais pelo e-mail.

**Prevenção de UX (pedido do Erick):** editar o **próprio** cadastro (nome/e-mail/etc.) ou redefinir a **própria** senha (via a ação de admin) agora força um logout automático com aviso claro, em vez de deixar a sessão em cache com dados desatualizados no Topbar — foi exatamente essa "sensação de que nada mudou" que causou o incidente.

**Atualização (resolvido):** a recuperação pontual nunca chegou a ser necessária de fato — o admin original tinha sido despromovido a `COLABORADOR` numa edição anterior (troca de cargo sem querer), então o próprio seed criou um admin novo com as credenciais padrão, e foi com ele que o Erick conseguiu entrar. `fix-admin-recovery.js` removido do `start.js` e do repositório — não tem mais função, e deixá-lo ligado poderia causar sobrescrita indesejada de credenciais num admin futuro.

**Correção relacionada — formulário de edição exigia área/cargo até pro admin:** o formulário de editar pessoa tinha os campos Área e Cargo marcados como `required` incondicionalmente, mesmo quando a pessoa editada é o `ADMIN` (que estruturalmente não tem nenhum dos dois). Corrigido: `editingIsAdmin` (derivado de `person.role === 'ADMIN'` em `openEdit`) esconde esses campos e mostra uma nota explicativa, e o payload enviado ao backend não inclui `areaId`/`positionId`/`managerId` nesse caso — evita forçar uma seleção que não faz sentido pra essa conta.

### 5.15 Unificação de status do relatório (pedido do Erick)

`PulseReportStatus.AGUARDANDO_IA` e `AGUARDANDO_PARECER` viraram um único valor: **`AGUARDANDO_FECHAMENTO`** — é o único status enquanto o gestor não finaliza a consolidação (gerar a análise de IA é uma etapa opcional dentro dele, não muda o status). Fluxo final: `EM_ANDAMENTO → AGUARDANDO_FECHAMENTO → FINALIZADO → ARQUIVADO`.

**Migração de dados existentes:** como já existiam relatórios de teste com os dois valores antigos, `fix-legacy-enum.js` ganhou uma segunda correção (`fixReportStatusMerge`) — diferente da correção anterior (que era uma *divisão* ambígua e por isso apagava dados), esta é uma ***fusão* inequívoca**: adiciona `AGUARDANDO_FECHAMENTO` ao enum antigo, faz `UPDATE` das linhas existentes, e só depois o `prisma db push` remove os dois valores antigos (que nesse ponto já estão sem nenhuma linha usando eles) — sem perda de nenhum dado real desta vez.

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

# PULSEONE — MAPEAMENTO TÉCNICO COMPLETO
**Versão do documento:** 1.1.0
**Status:** Base para início de desenvolvimento (revisado após correções obrigatórias)
**Referências aplicadas:** PulseOne_Logomarca > PulseOne_Demo_das_Telas > PulseOne_Design_System > PRD v1.0

**Decisões confirmadas na rodada anterior:**
- Sem fotos em nenhum lugar do sistema (inclusive PDF) — avatar sempre por iniciais.
- IA: Anthropic API substitui OpenAI API em todas as menções do PRD.
- PDF: Puppeteer (HTML→PDF) como solução principal. PDFKit apenas em uso pontual, se necessário.

**Correções obrigatórias aplicadas nesta revisão (v1.1.0):**
1. Autoavaliação passa a ser exibida apenas como referência informativa — **não entra no cálculo do score final**.
2. Vínculo de gestor deixa de ser um campo manual (`managerId`) e passa a ser **derivado do cargo** (`Position.isManager`) combinado com a área do usuário.
3. Adicionados tokens de **confirmação de e-mail** e **reset de senha** como entidades próprias (com expiração).
4. `PulseReport` ganhou um **status individual explícito** por colaborador/ciclo.
5. Regra de visibilidade: colaborador só enxerga resultado do ciclo **após `finalizedAt` preenchido**.
6. Seed do admin mantido com troca de senha obrigatória no primeiro login.
7. Modelo da Anthropic API deixa de ser hardcoded e passa a ser **parametrizado via `.env`**.

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

**Sprint 0 — Fundação (infra + autenticação)**
- Setup do monorepo (Next + Nest), Railway, GitHub Actions, Prisma init + migration inicial.
- Design tokens Tailwind + shadcn instalado e configurado.
- Auth completo: login, confirmação de e-mail, recuperação de senha (via `EmailVerificationToken`/`PasswordResetToken`, com TTL configurável), troca obrigatória no 1º login do admin.
- Seed: admin (`admin` / `Acesso@123`, `mustChangePwd=true`), 5 perguntas oficiais, áreas/cargos de exemplo (com ao menos um cargo `isManager=true` por área para validar a resolução dinâmica de gestor).

**Sprint 1 — Cadastros + Estrutura organizacional**
- CRUD Pessoas, Áreas, Cargos (telas 2 e 3 da demo).
- Sidebar + navegação por role (menus da seção 12 do PRD).
- AvatarInitials, ScoreRing, StatusBadge, ProgressBar (componentes-base do design system).

**Sprint 2 — Feedback Contínuo + Notificações**
- Envio de feedback a qualquer momento (destinatário, texto, NPS).
- Sistema de notificações (banner "Pulse aberto", sino no topbar).
- Dashboard do Colaborador (tela 1) com dados reais.

**Sprint 3 — Ciclo Pulse (core do produto)**
- Lifecycle do ciclo (RASCUNHO → ABERTO → ENCERRADO → EM_CONSOLIDAÇÃO → FINALIZADO → ARQUIVADO).
- Wizard de avaliação (tela 6): autoavaliação, avaliação do gestor, avaliação de colegas.
- Regras de anonimato aplicadas na API.
- Resolução dinâmica de gestor (`Area` + `Position.isManager`) implementada e testada.
- Cálculo de score: `finalScore = teamScore*0.6 + managerScore*0.4`, com `selfScore` calculado à parte, apenas informativo.
- `PulseReport.status` transicionando corretamente (`EM_ANDAMENTO` → `AGUARDANDO_IA` → `AGUARDANDO_PARECER` → `FINALIZADO`) e bloqueio de visibilidade ao colaborador antes de `FINALIZADO`.

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

---

## PRÓXIMO PASSO SUGERIDO

Com as 7 correções obrigatórias aplicadas (autoavaliação informativa, gestor derivado do cargo, tokens de e-mail/reset, status individual do relatório, bloqueio de visibilidade pré-`finalizedAt`, seed do admin mantido e modelo de IA via `.env`), este documento está pronto para validação final.

Após seu aceite, o próximo movimento é o **Sprint 0**: setup do projeto (estrutura de pastas real, `schema.prisma` rodando com as tabelas revisadas, autenticação com verificação de e-mail e reset de senha funcionais) antes de tocar em qualquer tela visual.

# PulseOne

**Transformando percepções em desenvolvimento.**

Plataforma web corporativa de Feedback 360°, mobile first, voltada ao desenvolvimento contínuo de equipes através de ciclos estruturados de feedback, score comportamental, NPS individual, consolidação gerencial e inteligência analítica.

---

## Stack

**Frontend**
- React + Next.js
- TypeScript
- TailwindCSS
- Shadcn/UI
- Lucide Icons

**Backend**
- Node.js + NestJS
- TypeScript
- Prisma ORM

**Banco de dados**
- PostgreSQL

**Infraestrutura**
- Railway (deploy)
- GitHub + GitHub Actions (CI/CD)

**Relatórios**
- Puppeteer (HTML → PDF) — solução principal
- PDFKit — apenas para necessidades pontuais

**Inteligência Artificial**
- Anthropic API (modelo parametrizado via `.env`)

**E-mail transacional**
- Resend (verificação de conta, reset de senha, notificações)

---

## Perfis de acesso

| Perfil | Permissões |
|---|---|
| **Administrador** | Cadastros (pessoas, áreas, cargos), ciclos Pulse, relatórios, configurações, auditoria |
| **Gestor** | Tudo do colaborador + consolidação do time, parecer final, PDF, análise via IA |
| **Colaborador** | Dashboard, feedbacks, Pulse, histórico, perfil |

Login inicial do administrador (seed): `admin` — troca de senha obrigatória no primeiro acesso.

---

## Estrutura do repositório

```
pulseone/
├── backend/        # API NestJS + Prisma
├── frontend/        # Aplicação Next.js
├── docs/             # PRD, design system e mapeamento técnico
└── README.md
```

---

## Ambiente (`.env`)

Ver `docs/mapeamento-tecnico.md` para a lista completa de variáveis (`DATABASE_URL`, `JWT_SECRET`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, tokens de verificação/reset, etc.).

---

## Versionamento

- Primeira release: `v1.0.0`
- Correções: `v1.0.x`
- Evoluções pequenas: `v1.x.0`
- Mudanças estruturais: `vX.0.0`

---

## Deploy

Aplicação hospedada no **Railway**, com banco **PostgreSQL** provisionado no mesmo projeto. Deploy contínuo a partir da branch `main` via GitHub Actions.

---

Versão 1.0.0 • Desenvolvido por Erick Torritese

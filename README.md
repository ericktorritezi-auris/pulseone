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

## Deploy (serviço único no Railway)

Backend (NestJS) e frontend (Next.js) rodam **no mesmo serviço Railway**, dentro do mesmo container:

- O **Next.js** ocupa a porta pública (`PORT`, injetada pelo Railway) e faz *proxy* interno de `/api/*` para o backend.
- O **NestJS** roda em uma porta interna fixa (`INTERNAL_API_PORT=3333`), nunca exposta diretamente.
- `start.js`, na raiz do repositório, sobe os dois processos juntos e aplica o schema do banco (`prisma db push`) + seed automaticamente.

**Domínio oficial:** `pulseone.belleplanner.com.br`

**Configuração no Railway:**
- Root Directory: raiz do repositório (não usar `backend` nem `frontend` isoladamente).
- Build Command: `npm run build`
- `nixpacks.toml` (raiz do repo) instala o Chromium como pacote de sistema durante o build — necessário pra geração de PDF (Puppeteer). Não precisa configurar nada manualmente no Railway; o Nixpacks lê esse arquivo sozinho.
- Start Command: `npm start`
- Variáveis: ver `.env.example` na raiz — é o conjunto único a preencher neste serviço.

Deploy contínuo a partir da branch `main` via GitHub Actions.

---

Versão 1.0.0 • Desenvolvido por BellePlanner

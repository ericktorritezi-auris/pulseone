'use client';

import {
  LogIn,
  LayoutDashboard,
  Send,
  Activity,
  User,
  History,
  Users,
  RefreshCw,
  FileText,
  Settings,
  KeyRound,
  UserPlus,
  ScrollText,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../../lib/auth-context';
import { ManualSection, MockScreen } from '../../../components/shared/ManualSection';

export default function ManualPage() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-p-primary-dark mb-1">Manual do Usuário</h1>
      <p className="text-sm text-p-neutral mb-6">
        Um guia simples de como usar o PulseOne, passo a passo. Clique em cada tópico pra abrir os
        detalhes. As imagens abaixo são ilustrações do formato de cada tela, não prints reais.
      </p>

      <div className="space-y-3">
        {/* ===================== TODOS OS PERFIS ===================== */}

        <ManualSection icon={LogIn} title="Como entrar no sistema" subtitle="Login e primeiro acesso" defaultOpen>
          <p>
            Acesse o endereço do PulseOne no navegador. Digite seu e-mail e senha e clique em{' '}
            <b>Entrar</b>.
          </p>
          <MockScreen label="tela de login" />
          <p>
            <b>Primeiro acesso, ou senha definida por um admin/gestor?</b> O sistema vai te pedir
            pra trocar a senha antes de continuar — é só digitar a senha atual, escolher uma nova
            (mínimo 8 caracteres, com 1 letra maiúscula e 1 caractere especial, tipo <code>!</code>{' '}
            ou <code>@</code>) e confirmar.
          </p>
        </ManualSection>

        <ManualSection icon={UserPlus} title="Como criar minha própria conta" subtitle="Autocadastro">
          <p>Se você é funcionário e ainda não tem conta, não precisa esperar ninguém te cadastrar:</p>
          <ol className="list-decimal list-inside space-y-1 pl-2">
            <li>Na tela de login, clique em <b>"Não tem conta? Cadastre-se"</b>.</li>
            <li>Preencha seu nome, e-mail, telefone.</li>
            <li>Escolha sua <b>área</b> (departamento) e seu <b>cargo</b> nas listas.</li>
            <li>
              Se souber quem é o seu gestor direto e ele já estiver cadastrado, selecione — se não
              souber, pode deixar em branco e ajustar depois.
            </li>
            <li>Escolha uma senha e confirme.</li>
            <li>Clique em <b>Criar minha conta</b> — pronto, já pode fazer login.</li>
          </ol>
        </ManualSection>

        <ManualSection icon={KeyRound} title="Esqueci minha senha">
          <p>
            Na tela de login, clique em <b>"Esqueci minha senha"</b>, digite seu e-mail e clique em
            enviar. Você vai receber um e-mail com um link pra criar uma senha nova. Se não chegar
            em alguns minutos, olha também a caixa de spam.
          </p>
        </ManualSection>

        <ManualSection icon={LayoutDashboard} title="Meu Painel (Dashboard)">
          <p>É a primeira tela que você vê depois de entrar. O que aparece muda de acordo com quem você é:</p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li><b>Colaborador:</b> seu score atual, o ciclo aberto (se houver) e quantas avaliações faltam, e os últimos feedbacks recebidos/enviados.</li>
            <li>
              <b>Gestor:</b> tudo isso, mais um resumo <b>por área</b> — se você atua em mais de uma
              área, cada uma aparece separada, com quantidade de colaboradores, score médio e NPS
              médio próprios. Tem também um painel de "como cada área te avaliou" (informativo — seu
              score oficial continua sendo um número único).
            </li>
            <li>
              <b>Admin:</b> um resumo geral do sistema — áreas, cargos e pulsos cadastrados, o pulso
              vigente, participação e pendências. Sem NPS/score aqui (isso é papel do gestor).
            </li>
          </ul>
          <MockScreen label="dashboard" />
        </ManualSection>

        <ManualSection icon={Send} title="Enviar um Feedback">
          <p>
            Feedback contínuo é diferente da avaliação oficial (Pulse) — você pode mandar um
            elogio, sugestão ou observação pra qualquer colega, a qualquer momento, sem precisar de
            um ciclo aberto. (Essa opção não aparece pro admin — ele não participa de feedback
            contínuo, só administra o sistema.)
          </p>
          <ol className="list-decimal list-inside space-y-1 pl-2">
            <li>Clique em <b>Enviar Feedback</b> (no painel ou no menu lateral).</li>
            <li>Escolha quem vai receber.</li>
            <li>Escreva a mensagem.</li>
            <li>Dê uma nota de 0 a 10 (o quanto você recomendaria essa pessoa pra outro projeto).</li>
            <li>Clique em enviar. A pessoa recebe uma notificação na hora.</li>
          </ol>
        </ManualSection>

        <ManualSection icon={Activity} title="Feedback Pulse — respondendo minhas avaliações">
          <p>
            Quando o administrador abre um novo ciclo de avaliação, você recebe uma notificação
            dentro do sistema <b>e também um e-mail</b> avisando que o ciclo está aberto e quantas
            avaliações você tem pendentes. Suas tarefas ficam em <b>Feedback Pulse</b>, no menu
            lateral. Elas podem ser de até 4 tipos, dependendo do seu cargo:
          </p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li><b>Minha Autoavaliação</b> — você avalia a si mesmo. Só uma, mesmo que você seja gestor de várias áreas.</li>
            <li><b>Avaliação de Colegas</b> — você avalia quem trabalha diretamente com você (mesmo gestor que você, mesma área).</li>
            <li><b>Avaliação do Gestor Direto</b> — se você tiver um gestor direto, você avalia ele.</li>
            <li><b>Avaliação da Equipe</b> — só aparece se você for gestor de alguém: você avalia cada liderado seu, mesmo que ele esteja em outra área que você também gerencia.</li>
          </ul>
          <MockScreen label="lista de avaliações pendentes" />
          <p>Pra responder uma avaliação:</p>
          <ol className="list-decimal list-inside space-y-1 pl-2">
            <li>Clique no nome da pessoa que você vai avaliar.</li>
            <li>Responda as 5 perguntas, escolhendo uma nota de 0 a 10 pra cada uma.</li>
            <li>
              Escreva um comentário (precisa ter pelo menos 200 caracteres — é bastante coisa, então
              seja específico: dê exemplos concretos).
            </li>
            <li>Clique em <b>Concluir avaliação</b>.</li>
          </ol>
          <p>
            <b>Importante:</b> enquanto o ciclo estiver aberto, você pode voltar e editar qualquer
            avaliação já enviada. Depois que o administrador encerrar o ciclo, não dá mais pra
            mudar nada.
          </p>
        </ManualSection>

        <ManualSection icon={History} title="Meu Histórico e meus resultados">
          <p>
            Em <b>Histórico</b>, você vê os ciclos de avaliação de que já participou. Um ciclo só
            fica disponível pra você ver o resultado completo depois que:
          </p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li>Seu gestor finalizar o parecer sobre você, <b>e</b></li>
            <li>Todo mundo da sua área também já tiver o resultado pronto.</li>
          </ul>
          <p>
            Isso existe de propósito: ninguém vê o próprio resultado antes dos outros da mesma
            área, pra ser justo com todo mundo. Quando estiver liberado, clique no ciclo pra ver seu
            score, o que colegas e gestor disseram (nomes de colegas e liderados aparecem como
            "Colega 1", "Liderado 1" etc., pra manter o anonimato) e o parecer final. Se você está
            no topo da hierarquia (sem gestor acima), não existe parecer — você só vê o que o time
            disse, e o relatório libera assim que a área terminar.
          </p>
          <p>
            Quando um ciclo é <b>arquivado</b> pelo administrador, você também recebe um e-mail com
            o PDF do seu relatório final em anexo — é o seu registro pra guardar.
          </p>
        </ManualSection>

        <ManualSection icon={User} title="Meu Perfil">
          <p>
            Mostra seus dados básicos: nome, e-mail, área, cargo (se você tiver — admin não tem
            nenhum dos dois) e seu nível de acesso no sistema.
          </p>
          <p>
            Também é aqui que você <b>troca a própria senha</b> — precisa digitar a senha atual e
            escolher uma nova. Isso vale pra qualquer pessoa, incluindo admin.
          </p>
        </ManualSection>

        {/* ===================== GESTOR ===================== */}

        {(user.role === 'GESTOR' || user.role === 'ADMIN') && (
          <>
            <ManualSection icon={Users} title="Cadastrar Pessoas" subtitle="Gestor e Admin">
              <p>
                Vá em <b>Pessoas</b>, no menu lateral, e clique em <b>Cadastrar Pessoa</b>. A lista
                mostra todo mundo das áreas em que você atua — se você é gestor de mais de uma área,
                aparece gente de todas elas juntas, não só de uma.
              </p>
              <ol className="list-decimal list-inside space-y-1 pl-2">
                <li>Preencha nome, e-mail, telefone.</li>
                <li>
                  Escolha a <b>Área</b> principal da pessoa (gestor só escolhe entre as áreas em que
                  ele mesmo atua).
                </li>
                <li>
                  Escolha o <b>Cargo</b> (a lista já filtra pelos cargos daquela área) — se o cargo
                  for de gestão, a pessoa já vira gestora automaticamente.
                </li>
                <li>
                  <b>Se o cargo escolhido for de gestão</b>, aparece um campo extra: "Outras áreas de
                  atuação" — marque ali as demais áreas que essa pessoa também vai gerenciar, além da
                  principal. Um gestor pode atuar em quantas áreas forem necessárias.
                </li>
                <li>Se quiser, indique quem é o gestor direto dela.</li>
                <li>Defina uma senha inicial e salve.</li>
              </ol>
              <p>
                <b>E-mail já cadastrado?</b> Pode acontecer da mesma pessoa precisar de duas contas
                (ex: é admin e também gestor de uma área) — nesse caso aparece um aviso pedindo a
                senha MASTER do sistema. Sem ela, o cadastro é bloqueado e pede um e-mail diferente.
              </p>
              <p>
                <b>Reativar alguém:</b> uma pessoa inativada continua na lista, com um botão de
                reativar no lugar do de excluir — o histórico dela nunca é apagado.
              </p>
            </ManualSection>

            <ManualSection icon={Users} title="Avaliação do Time" subtitle="Acompanhando o progresso da sua equipe">
              <p>
                Durante um ciclo aberto, essa tela mostra o percentual de conclusão de cada pessoa
                das áreas em que você atua — quem já terminou as avaliações e quem ainda está
                devendo. Você não vê o conteúdo das respostas aqui, só o progresso, pra saber quem
                cobrar.
              </p>
              <MockScreen label="progresso da equipe" />
            </ManualSection>

            <ManualSection icon={FileText} title="Relatórios — consolidando o resultado do seu time">
              <p>
                Depois que o administrador consolida um ciclo, os relatórios da sua equipe aparecem
                aqui pra você finalizar:
              </p>
              <ol className="list-decimal list-inside space-y-1 pl-2">
                <li>Clique no nome da pessoa em <b>Relatórios</b>.</li>
                <li>Veja o score, o NPS e os comentários que ela recebeu.</li>
                <li>
                  Clique em <b>Gerar análise</b> se quiser uma sugestão automática de pontos
                  fortes, melhorias e um rascunho de parecer.
                </li>
                <li>Escreva (ou ajuste) o parecer final no campo de texto.</li>
                <li>
                  Clique em <b>Finalizar Relatório</b> — depois disso não dá mais pra editar, e a
                  pessoa passa a poder ver o resultado (assim que toda a área estiver pronta).
                </li>
              </ol>
              <p>
                <b>Exceção:</b> se alguém está no topo da hierarquia (não tem gestor acima), o
                relatório dela libera sozinho, sem precisar de parecer — ela só vê o que o time
                disse.
              </p>
              <p>Também dá pra baixar um PDF do relatório completo, pelo botão "Baixar PDF".</p>
            </ManualSection>
          </>
        )}

        {/* ===================== ADMIN ===================== */}

        {user.role === 'ADMIN' && (
          <>
            <ManualSection icon={Users} title="Áreas e Cargos" subtitle="Estrutura organizacional">
              <p>
                Antes de cadastrar pessoas, é preciso ter pelo menos uma <b>Área</b> (departamento,
                ex: Marketing, Vendas) criada. Todo <b>Cargo</b> pertence a uma área específica — ao
                criar um cargo, escolha primeiro a área, depois marque "é gestor" pros cargos de
                liderança (isso é o que define automaticamente quem vira gestor no sistema).
              </p>
            </ManualSection>

            <ManualSection icon={ShieldCheck} title="Criando outro Admin">
              <p>
                Na tela de <b>Cadastrar Pessoa</b>, aparece um checkbox exclusivo do admin: "Esta
                pessoa é administradora do sistema". Marcando, some Área/Cargo/Gestor Direto — admin
                não pertence a nenhum dos três.
              </p>
              <p>
                <b>Importante:</b> ninguém é promovido a admin depois de já cadastrado — só é
                possível marcar essa opção na hora da criação. Se precisar, admin também pode
                inativar ou reativar o cadastro de outro admin (gestor não tem esse acesso).
              </p>
            </ManualSection>

            <ManualSection icon={KeyRound} title="Redefinir a senha de alguém">
              <p>
                Editando o cadastro de qualquer pessoa (Pessoas → ícone de lápis), existe uma seção
                separada, só pra admin, chamada <b>Redefinir Senha</b> — diferente de "Alterar
                Senha" (que cada um faz pra si mesmo em Meu Perfil), aqui o admin define uma senha
                nova sem precisar saber a antiga. A pessoa é obrigada a trocar essa senha no próximo
                login.
              </p>
            </ManualSection>

            <ManualSection icon={RefreshCw} title="Ciclos Pulse" subtitle="Abrindo e encerrando avaliações">
              <p>É aqui que você controla o calendário de avaliações da empresa inteira:</p>
              <ol className="list-decimal list-inside space-y-1 pl-2">
                <li>Clique em <b>Novo Ciclo</b>, dê um nome (ex: "Pulse Julho/2026").</li>
                <li>
                  Clique em <b>Abrir Ciclo</b> — isso gera automaticamente todas as avaliações de
                  todo mundo <b>e dispara um e-mail</b> pra cada pessoa com avaliação pendente.
                </li>
                <li>Acompanhe o progresso clicando em <b>Ver Progresso</b>.</li>
                <li>Quando achar que já deu tempo suficiente, clique em <b>Encerrar Ciclo</b>.</li>
                <li>Clique em <b>Consolidar</b> — isso calcula o score de cada pessoa.</li>
                <li>
                  Espere os gestores finalizarem os pareceres de cada pessoa (acompanhe em{' '}
                  <b>Ver Consolidação</b>).
                </li>
                <li>
                  Quando 100% dos relatórios estiverem prontos, clique em <b>Finalizar Ciclo</b> —
                  esse é o fechamento definitivo.
                </li>
                <li>
                  Por fim, <b>Arquivar</b> — isso gera e manda por e-mail o PDF final de cada pessoa,
                  automaticamente.
                </li>
              </ol>
              <MockScreen label="ciclos pulse" />
            </ManualSection>

            <ManualSection icon={FileText} title="Relatórios (todos)">
              <p>
                Como administrador, você vê e pode finalizar o relatório de qualquer pessoa — é uma
                forma de resolver casos em que o gestor direto não conseguiu, ou de quem está no
                topo da hierarquia (que não tem gestor acima).
              </p>
            </ManualSection>

            <ManualSection icon={ScrollText} title="Auditoria">
              <p>
                Registro de tudo que acontece no sistema — quem fez o quê e quando: login, logout,
                cadastros, edições, exclusões, feedbacks, fechamentos de ciclo, geração de análises e de
                PDF. Dá pra filtrar por tipo de ação.
              </p>
            </ManualSection>

            <ManualSection icon={Settings} title="Configurações" subtitle="Zona de Perigo">
              <p>
                Tem uma área ali chamada <b>Zona de Perigo</b>, que apaga todos os dados de teste do
                sistema (pessoas, áreas, cargos, ciclos, feedbacks) — deixando só o(s) cadastro(s)
                de administrador que estiverem <b>ativos</b> no momento (admin inativado é apagado
                junto com o resto). Use isso <b>só</b> quando terminar todos os testes e estiver
                pronto pra começar a usar o sistema de verdade, com dados reais. Ela pede a frase de
                confirmação exata <b>e</b> a senha MASTER — as duas precisam bater, de propósito,
                pra ninguém apagar tudo sem querer.
              </p>
            </ManualSection>
          </>
        )}
      </div>
    </div>
  );
}

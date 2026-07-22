'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users,
  TrendingUp,
  ShieldCheck,
  HeartHandshake,
  Smile,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../lib/auth-context';

const BENEFITS = [
  {
    icon: Users,
    title: 'Feedback 360°',
    text: 'Visão completa e colaborativa.',
  },
  {
    icon: TrendingUp,
    title: 'Desenvolvimento contínuo',
    text: 'Crescimento individual e coletivo.',
  },
  {
    icon: ShieldCheck,
    title: 'Decisões mais assertivas',
    text: 'Insights que geram impacto real.',
  },
  {
    icon: HeartHandshake,
    title: 'Cultura de confiança',
    text: 'Ambiente seguro para evoluir juntos.',
  },
  {
    icon: Smile,
    title: 'NPS da área',
    text: 'Monitoramento do clima e do engajamento.',
  },
];

const STEPS = [
  {
    n: '01',
    title: 'O ciclo abre',
    text: 'O administrador abre um novo Pulse. Cada pessoa já vê, na hora, o que precisa fazer.',
  },
  {
    n: '02',
    title: 'Todo mundo avalia',
    text: 'Autoavaliação, colegas do mesmo time e o gestor direto — cada um responde a sua parte.',
  },
  {
    n: '03',
    title: 'O gestor consolida',
    text: 'Score calculado, análise preditiva como apoio, e o parecer final escrito por quem acompanha de perto.',
  },
  {
    n: '04',
    title: 'O resultado é liberado',
    text: 'Cada pessoa vê o próprio resultado assim que toda a área estiver pronta — nunca antes, nunca sozinha.',
  },
];

function PulseMark({ size = 260 }: { size?: number }) {
  const rings = [0, 1.05, 2.1];
  return (
    <div
      className="relative flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {rings.map((delay) => (
        <span
          key={delay}
          className="pulse-ring absolute rounded-full border-2"
          style={{
            width: size * 0.62,
            height: size * 0.62,
            borderColor: '#2563EB',
            animationDelay: `${delay}s`,
          }}
        />
      ))}
      <div
        className="relative rounded-full flex items-center justify-center"
        style={{
          width: size * 0.4,
          height: size * 0.4,
          background: 'linear-gradient(135deg, #2563EB 0%, #0EA5E9 100%)',
        }}
      >
        <span className="text-white font-extrabold" style={{ fontSize: size * 0.16 }}>
          P
        </span>
      </div>
      {[0, 90, 180, 270].map((deg) => (
        <span
          key={deg}
          className="absolute rounded-full"
          style={{
            width: size * 0.045,
            height: size * 0.045,
            background: deg % 180 === 0 ? '#2563EB' : '#0EA5E9',
            transform: `rotate(${deg}deg) translate(${size * 0.42}px) rotate(-${deg}deg)`,
          }}
        />
      ))}
    </div>
  );
}

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace('/dashboard');
    }
  }, [loading, user, router]);

  if (loading || user) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-p-bg">
        <p className="text-p-neutral text-sm">Carregando...</p>
      </main>
    );
  }

  return (
    <main className="bg-p-bg text-p-primary-dark overflow-x-hidden">
      {/* Nav */}
      <header className="max-w-6xl mx-auto flex items-center justify-between px-6 py-6">
        <span className="text-lg font-bold tracking-tight">
          Pulse<span className="text-p-primary">One</span>
        </span>
        <a
          href="/login"
          className="text-sm font-medium px-4 py-2 rounded-lg border border-slate-300 hover:border-p-primary hover:text-p-primary transition-colors"
        >
          Entrar
        </a>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-10 pb-20 md:pt-16 md:pb-28 grid md:grid-cols-2 gap-12 items-center">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-p-secondary uppercase mb-4">
            Feedback 360° corporativo
          </p>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.05] mb-6">
            Transformando
            <br />
            percepções em
            <br />
            <span className="text-p-primary">desenvolvimento.</span>
          </h1>
          <p className="text-base md:text-lg text-p-neutral max-w-md mb-8">
            Ciclos estruturados de feedback, score comportamental e consolidação gerencial — pra
            equipes que querem crescer com base em dados reais, não em achismo.
          </p>
          <a
            href="/login"
            className="inline-flex items-center gap-2 bg-p-primary text-white px-6 py-3.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Entrar no PulseOne
            <ArrowRight size={16} />
          </a>
        </div>

        <div className="flex justify-center md:justify-end">
          <PulseMark size={300} />
        </div>
      </section>

      {/* O que é */}
      <section className="border-t border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <p className="text-xs font-semibold tracking-[0.18em] text-p-secondary uppercase mb-3">
            O que é
          </p>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight max-w-2xl mb-10">
            Um único lugar onde colaborador, gestor e administrador enxergam a mesma verdade.
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <p className="text-sm font-semibold text-p-primary-dark mb-1.5">Colaborador</p>
              <p className="text-sm text-p-neutral">
                Se autoavalia, avalia colegas do mesmo time e o próprio gestor — e acompanha sua
                evolução ciclo a ciclo.
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <p className="text-sm font-semibold text-p-primary-dark mb-1.5">Gestor</p>
              <p className="text-sm text-p-neutral">
                Acompanha o progresso da própria equipe, consolida resultados e escreve o parecer
                final de cada pessoa.
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <p className="text-sm font-semibold text-p-primary-dark mb-1.5">Administrador</p>
              <p className="text-sm text-p-neutral">
                Estrutura áreas e cargos, abre e encerra ciclos, e enxerga a participação da
                organização inteira.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefícios */}
      <section className="border-t border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <p className="text-xs font-semibold tracking-[0.18em] text-p-secondary uppercase mb-3">
            Benefícios
          </p>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight max-w-2xl mb-10">
            Feito pra times que levam desenvolvimento a sério.
          </h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-5 gap-5">
            {BENEFITS.map((b) => (
              <div key={b.title} className="p-5 rounded-2xl border border-slate-200">
                <div className="w-10 h-10 rounded-lg bg-p-primary/10 text-p-primary flex items-center justify-center mb-4">
                  <b.icon size={18} />
                </div>
                <p className="text-sm font-semibold text-p-primary-dark mb-1">{b.title}</p>
                <p className="text-xs text-p-neutral leading-relaxed">{b.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section className="border-t border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <p className="text-xs font-semibold tracking-[0.18em] text-p-secondary uppercase mb-3">
            Como funciona
          </p>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight max-w-2xl mb-12">
            Quatro etapas, sempre na mesma ordem.
          </h2>
          <div className="grid md:grid-cols-4 gap-8">
            {STEPS.map((s, i) => (
              <div key={s.n} className="relative pl-1">
                <p
                  className="text-4xl font-extrabold mb-3"
                  style={{ color: i === 0 ? '#2563EB' : '#CBD5E1' }}
                >
                  {s.n}
                </p>
                <p className="text-sm font-semibold text-p-primary-dark mb-2">{s.title}</p>
                <p className="text-xs text-p-neutral leading-relaxed">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="border-t border-slate-200 bg-p-primary-dark text-white">
        <div className="max-w-6xl mx-auto px-6 py-20 text-center">
          <h2 className="text-2xl md:text-4xl font-extrabold tracking-tight mb-4">
            Pronto pra transformar percepções em desenvolvimento?
          </h2>
          <p className="text-sm md:text-base text-slate-300 mb-8 max-w-lg mx-auto">
            Entre com sua conta ou fale com o administrador da sua organização pra começar.
          </p>
          <a
            href="/login"
            className="inline-flex items-center gap-2 bg-white text-p-primary-dark px-6 py-3.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Entrar no PulseOne
            <ArrowRight size={16} />
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-6 text-center text-xs text-p-neutral border-t border-slate-200">
        Versão 1.1.0 • Desenvolvido por BellePlanner
      </footer>
    </main>
  );
}

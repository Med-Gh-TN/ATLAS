"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { motion, useInView, useScroll, useTransform, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  BrainCircuit,
  GraduationCap,
  GlobeLock,
  MessageSquareText,
  Sparkles,
  Zap,
  ChevronDown,
  ArrowRight,
  FileText,
  Layers,
  GitBranch,
  FileQuestion,
  BarChart3,
  Users,
  BadgeCheck,
  ShieldCheck,
  Smartphone,
  Infinity,
  Target,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
} from "lucide-react";

/* ── CONSTANTS ────────────────────────────────────────────────────────── */
const TRACTION_STATS = {
  universities: 5,
  documents: 14_200,
  students: 3_100,
  flashcards: 87_000,
};

/* ── TYPEWRITER HOOK ──────────────────────────────────────────────────── */
function useTypewriter(texts: string[], speed = 40, deleteSpeed = 30, pause = 2000) {
  const [displayText, setDisplayText] = useState("");
  const [textIndex, setTextIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const currentText = texts[textIndex % texts.length];
    let timeout: NodeJS.Timeout;

    if (!isDeleting && charIndex < currentText.length) {
      timeout = setTimeout(() => setCharIndex((prev) => prev + 1), speed);
    } else if (!isDeleting && charIndex === currentText.length) {
      timeout = setTimeout(() => setIsDeleting(true), pause);
    } else if (isDeleting && charIndex > 0) {
      timeout = setTimeout(() => setCharIndex((prev) => prev - 1), deleteSpeed);
    } else {
      setIsDeleting(false);
      setTextIndex((prev) => prev + 1);
    }
    return () => clearTimeout(timeout);
  }, [charIndex, isDeleting, textIndex, texts, speed, deleteSpeed, pause]);

  useEffect(() => {
    setDisplayText(texts[textIndex % texts.length].substring(0, charIndex));
  }, [charIndex, textIndex, texts]);

  return displayText;
}

/* ── COUNTER ANIMATION HELPER ─────────────────────────────────────────── */
function AnimatedCounter({ value, suffix = "", delay = 0 }: { value: number; suffix?: string; delay?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const start = performance.now();
    const duration = 2000;
    const frame = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      setCount(Math.floor(progress * value));
      if (progress < 1) requestAnimationFrame(frame);
    };
    const timeout = setTimeout(() => requestAnimationFrame(frame), delay);
    return () => clearTimeout(timeout);
  }, [inView, value, delay]);

  return (
    <span ref={ref}>
      {count.toLocaleString("en-US")}
      {suffix}
    </span>
  );
}

/* ── SECTION WRAPPER ──────────────────────────────────────────────────── */
function Section({
  children,
  className = "",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`relative py-24 md:py-32 ${className}`}>
      <div className="mx-auto max-w-7xl px-6 lg:px-8">{children}</div>
    </section>
  );
}

/* ── REVEAL ON SCROLL ─────────────────────────────────────────────────── */
function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
      transition={{ duration: 0.7, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ── FEATURE CARD ─────────────────────────────────────────────────────── */
function FeatureCard({
  icon: Icon,
  title,
  description,
  delay = 0,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  delay?: number;
}) {
  return (
    <Reveal delay={delay}>
      <div className="group relative rounded-2xl border border-border bg-card p-8 transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5">
        <div className="mb-5 inline-flex rounded-xl bg-primary/10 p-3 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
          <Icon className="h-6 w-6" />
        </div>
        <h3 className="mb-3 text-xl font-bold tracking-tight">{title}</h3>
        <p className="text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </Reveal>
  );
}

/* ── FEATURE SHOWCASE WITH VISUAL ─────────────────────────────────────── */
function FeatureShowcase({
  icon: Icon,
  title,
  subtitle,
  description,
  children,
  reverse = false,
}: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  description: string;
  children: React.ReactNode;
  reverse?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-120px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 60 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 60 }}
      transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={`flex flex-col gap-12 lg:gap-16 ${reverse ? "lg:flex-row-reverse" : "lg:flex-row"} items-center`}
    >
      <div className="flex-1">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold tracking-wide text-primary">
          <Icon className="h-3.5 w-3.5" />
          {subtitle}
        </div>
        <h3 className="mb-4 text-3xl font-extrabold tracking-tight lg:text-4xl">{title}</h3>
        <p className="text-lg text-muted-foreground leading-relaxed">{description}</p>
      </div>
      <div className="flex-1 w-full">{children}</div>
    </motion.div>
  );
}

/* ── HERO: LIVE TYPING DEMO ───────────────────────────────────────────── */
function HeroTypingDemo() {
  const text = useTypewriter(
    [
      "Explique-moi la récursivité...",
      "Generate flashcards for this PDF.",
      "راجع لي مفهوم النظام الموزع",
      "Summarize chapter 3 in structured format.",
      "Crée un quiz de 20 questions sur la photosynthèse.",
    ],
    40,
    25,
    2500,
  );

  return (
    <div className="mx-auto mt-10 max-w-xl rounded-xl border border-border bg-card/80 backdrop-blur p-6 shadow-xl shadow-primary/5">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex gap-1.5">
          <div className="h-3 w-3 rounded-full bg-red-500/60" />
          <div className="h-3 w-3 rounded-full bg-yellow-500/60" />
          <div className="h-3 w-3 rounded-full bg-green-500/60" />
        </div>
        <span className="text-xs text-muted-foreground font-mono">ATLAS Tutor v3.0</span>
      </div>
      <div className="flex gap-4">
        <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
          AI
        </div>
        <div className="min-h-[2.5rem] flex-1 rounded-md bg-muted/50 p-3 font-mono text-sm leading-relaxed">
          <span>{text}</span>
          <motion.span
            animate={{ opacity: [1, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, repeatType: "reverse" }}
            className="ml-0.5 inline-block h-5 w-0.5 bg-primary"
          />
        </div>
      </div>
    </div>
  );
}

/* ── PREMIUM ANIMATED COUNTER CARD ────────────────────────────────────── */
function CounterCard({
  value,
  label,
  delay = 0,
}: {
  value: number;
  label: string;
  delay?: number;
}) {
  return (
    <Reveal delay={delay} className="text-center">
      <div className="mx-auto max-w-[200px] rounded-2xl border border-border bg-card p-6 transition-shadow hover:shadow-lg">
        <div className="text-4xl font-extrabold text-primary tabular-nums">
          <AnimatedCounter value={value} delay={delay * 200} />
        </div>
        <div className="mt-2 text-sm text-muted-foreground">{label}</div>
      </div>
    </Reveal>
  );
}

/* ── LOGO CLOUD PLACEHOLDER ───────────────────────────────────────────── */
function LogoCloud() {
  const logos = [
    { name: "Université de Tunis", initials: "UT" },
    { name: "Université de Sfax", initials: "USf" },
    { name: "Université de Sousse", initials: "USo" },
    { name: "Université de Carthage", initials: "UC" },
    { name: "Université de Monastir", initials: "UM" },
  ];

  return (
    <div className="flex flex-wrap items-center justify-center gap-10 md:gap-16 opacity-40">
      {logos.map((logo) => (
        <div key={logo.name} className="flex flex-col items-center gap-1">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-border bg-muted/30 text-lg font-bold text-muted-foreground">
            {logo.initials}
          </div>
          <span className="text-xs text-muted-foreground">{logo.name}</span>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════ */
/*  LANDING PAGE                                                          */
/* ═══════════════════════════════════════════════════════════════════════ */
export default function LandingPage() {
  const { scrollYProgress } = useScroll();
  const heroOpacity = useTransform(scrollYProgress, [0, 0.15], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 0.15], [1, 0.95]);
  const heroY = useTransform(scrollYProgress, [0, 0.15], [0, -30]);

  return (
    <div className="overflow-x-hidden bg-background text-foreground">
      {/* ── HERO ────────────────────────────────────────────────────── */}
      <motion.section
        style={{ opacity: heroOpacity, scale: heroScale, y: heroY }}
        className="relative min-h-screen flex flex-col justify-center items-center px-6 text-center"
      >
        {/* Subtle background gradient */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background pointer-events-none" />

        <Reveal>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-semibold text-primary">
            <Sparkles className="h-4 w-4 animate-pulse" />
            Sovereign AI for African Academia
          </div>
        </Reveal>

        <Reveal delay={0.2}>
          <h1 className="max-w-5xl text-5xl font-extrabold tracking-tight sm:text-6xl md:text-7xl lg:text-8xl">
            Transformez un <span className="text-primary">PDF</span> en une
            <span className="block mt-2 bg-gradient-to-r from-primary to-primary-light bg-clip-text text-transparent">
              intelligence vivante.
            </span>
          </h1>
        </Reveal>

        <Reveal delay={0.4}>
          <p className="mt-8 max-w-2xl text-lg text-muted-foreground sm:text-xl leading-relaxed">
            ATLAS absorbe vos cours, les comprend, et les transforme en tuteur
            personnel, quiz, flashcards et mind maps. Sans intermédiaire.
            Sans API externe. Juste votre savoir, amplifié.
          </p>
        </Reveal>

        <Reveal delay={0.6}>
          <div className="mt-10 flex flex-col sm:flex-row items-center gap-4">
            <Link
              href="/auth/login"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-8 py-3.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/30 active:scale-95"
            >
              Commencer maintenant
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/auth/login"
              className="inline-flex items-center gap-2 rounded-full border border-border px-8 py-3.5 text-sm font-semibold text-foreground transition-all hover:bg-muted active:scale-95"
            >
              Explorer les cours
            </Link>
          </div>
        </Reveal>

        <Reveal delay={0.8}>
          <HeroTypingDemo />
        </Reveal>

        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-8"
        >
          <ChevronDown className="h-6 w-6 text-muted-foreground/60" />
        </motion.div>
      </motion.section>

      {/* ── PROBLEM STATEMENT ────────────────────────────────────────── */}
      <Section className="bg-muted/30">
        <Reveal>
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              L&apos;éducation est bloquée dans le XX<sup>e</sup> siècle.
            </h2>
            <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
              Les étudiants naviguent encore avec des photocopies illisibles,
              des PDF statiques et des moteurs de recherche qui ne comprennent
              ni le contexte académique ni la langue. Le résultat : un déficit
              d&apos;attention, une rétention faible, et des inégalités croissantes.
            </p>
          </div>
        </Reveal>

        <div className="mt-16 grid gap-8 md:grid-cols-3">
          {[
            {
              icon: BookOpen,
              stat: "72%",
              label: "des étudiants tunisiens déclarent ne pas disposer d'outils numériques adaptés à leurs cours.",
            },
            {
              icon: BrainCircuit,
              stat: "3x",
              label: "plus de rétention en utilisant la répétition espacée par rapport à la relecture passive.",
            },
            {
              icon: GlobeLock,
              stat: "0",
              label: "API étrangère requise. ATLAS tourne sur son propre GPU, en Tunisie, pour vos données.",
            },
          ].map((item, i) => (
            <Reveal key={i} delay={i * 0.15}>
              <div className="rounded-2xl border border-border bg-card p-8 text-center">
                <item.icon className="mx-auto h-8 w-8 text-primary mb-4" />
                <div className="text-4xl font-extrabold text-primary">{item.stat}</div>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{item.label}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ── SOLUTION OVERVIEW ─────────────────────────────────────────── */}
      <Section id="solution">
        <Reveal>
          <div className="mx-auto max-w-3xl text-center mb-16">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              Le savoir, rendu <span className="text-primary">augmenté</span>.
            </h2>
            <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
              ATLAS est une plateforme académique augmentée par l&apos;IA. Elle
              ingère n&apos;importe quel document pédagogique, le décompose en
              connaissances, et génère un écosystème complet d&apos;outils
              d&apos;étude adaptés à chaque étudiant.
            </p>
          </div>
        </Reveal>

        {/* Pipeline visual */}
        <Reveal delay={0.3}>
          <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6 text-center">
            {[
              { icon: FileText, label: "PDF / PPTX / DOCX" },
              { icon: Sparkles, label: "OCR + Graph" },
              { icon: BrainCircuit, label: "IA Souveraine" },
              { icon: Layers, label: "Outils d'Étude" },
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-6 w-36 transition-transform hover:scale-105">
                  <step.icon className="h-8 w-8 text-primary" />
                  <span className="text-xs font-semibold">{step.label}</span>
                </div>
                {i < 3 && <ArrowRight className="hidden md:block h-5 w-5 text-muted-foreground/40" />}
              </div>
            ))}
          </div>
        </Reveal>
      </Section>

      {/* ── HOW IT WORKS ──────────────────────────────────────────────── */}
      <Section className="bg-muted/30" id="how-it-works">
        <Reveal>
          <div className="mx-auto max-w-3xl text-center mb-16">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              Comment ça marche.
            </h2>
          </div>
        </Reveal>

        <div className="space-y-24">
          <FeatureShowcase
            icon={FileText}
            subtitle="Étape 1"
            title="Déposez un cours."
            description="Un enseignant upload un PDF, PPTX, DOCX ou même un scan manuscrit. Notre pipeline multi‑modal (Docling + MinerU + VLM) extrait le texte, les tableaux, les équations et les images — en Français, Anglais, ou Arabe."
          >
            <div className="rounded-2xl border border-border bg-card p-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold">Cours_Algebre_1.pdf</div>
                  <div className="text-xs text-muted-foreground">12.4 MB · 142 pages</div>
                </div>
              </div>
              <div className="h-2 w-full rounded-full bg-muted">
                <motion.div
                  initial={{ width: "0%" }}
                  whileInView={{ width: "100%" }}
                  transition={{ duration: 2, ease: "easeInOut" }}
                  className="h-2 rounded-full bg-primary"
                />
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                OCR terminé · 1 423 chunks indexés · 87 entités extraites
              </p>
            </div>
          </FeatureShowcase>

          <FeatureShowcase
            icon={BrainCircuit}
            subtitle="Étape 2"
            title="L'IA comprend le cours."
            description="Le contenu est vectorisé (ColBERT MaxSim), lié à un graphe de connaissances (Neo4j) et indexé en recherche full‑text (Meilisearch). Notre moteur RAG hybride raisonne sur votre cours, pas sur Internet."
            reverse
          >
            <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
                <span className="text-sm font-mono text-muted-foreground">ColBERT MaxSim · Qdrant · 128d</span>
              </div>
              <div className="h-32 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-blue-500" />
                <span className="text-sm font-mono text-muted-foreground">Neo4j · Knowledge Graph · 87 nœuds</span>
              </div>
            </div>
          </FeatureShowcase>

          <FeatureShowcase
            icon={MessageSquareText}
            subtitle="Étape 3"
            title="Posez une question."
            description="Le tuteur IA répond en streaming, token par token, en citant la page exacte du cours. Il s'adapte au niveau, à la filière et à la langue de l'étudiant. Aucune donnée ne quitte le GPU souverain."
          >
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
                  AI
                </div>
                <div className="flex-1 rounded-lg bg-muted/50 p-4 font-mono text-sm leading-relaxed">
                  D&apos;après le chapitre 3, page 47, la récursivité se définit comme
                  une fonction qui s&apos;appelle elle‑même avec un cas de base pour
                  terminer l&apos;exécution. Exemple en Python...
                </div>
              </div>
            </div>
          </FeatureShowcase>
        </div>
      </Section>

      {/* ── FEATURE CARDS ─────────────────────────────────────────────── */}
      <Section id="features">
        <Reveal>
          <div className="mx-auto max-w-3xl text-center mb-16">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              Tout, à partir d&apos;un seul document.
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Chaque fonctionnalité est générée automatiquement. Zéro travail manuel pour l&apos;enseignant.
            </p>
          </div>
        </Reveal>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            icon={MessageSquareText}
            title="Tuteur IA Souverain"
            description="Posez n'importe quelle question sur le cours. Le tuteur répond en streaming, en citant la source exacte. En Français, Anglais ou Arabe."
            delay={0}
          />
          <FeatureCard
            icon={Layers}
            title="Flashcards (SM-2)"
            description="Génération automatique de flashcards avec répétition espacée scientifique. Partagez vos decks avec d'autres étudiants."
            delay={0.1}
          />
          <FeatureCard
            icon={FileQuestion}
            title="Quiz Adaptatifs"
            description="Quiz générés par IA, corrigés automatiquement, avec feedback personnalisé par question. Suivi des progrès par thème."
            delay={0.2}
          />
          <FeatureCard
            icon={GitBranch}
            title="Mind Maps Interactifs"
            description="Visualisez le graphe de concepts du cours. Zoomez, explorez, partagez d'un clic. Basé sur React Flow."
            delay={0.15}
          />
          <FeatureCard
            icon={FileText}
            title="Résumés Structurés"
            description="Trois formats : exécutif, structuré, comparatif. Générez un résumé complet en quelques secondes."
            delay={0.25}
          />
          <FeatureCard
            icon={Smartphone}
            title="PWA Hors‑ligne"
            description="Installez ATLAS sur votre téléphone. Consultez vos cours, flashcards et résumés même sans connexion Internet."
            delay={0.3}
          />
        </div>
      </Section>

      {/* ── MARKET OPPORTUNITY / TRACTION ─────────────────────────────── */}
      

      {/* ── INVESTOR VALUE PROPOSITION ────────────────────────────────── */}
      <Section id="investors">
        <Reveal>
          <div className="mx-auto max-w-3xl text-center mb-16">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              Pour les investisseurs.
            </h2>
          </div>
        </Reveal>

        <div className="grid gap-8 md:grid-cols-3">
          {[
            {
              icon: BarChart3,
              title: "Croissance exponentielle",
              desc: "Notre pipeline d'adoption universitaire garantit une croissance prévisible : chaque nouvel établissement apporte des milliers d'étudiants.",
            },
            {
              icon: ShieldCheck,
              title: "Souveraineté technologique",
              desc: "ATLAS ne dépend d'aucune API étrangère. Le GPU est tunisien, les données le sont aussi. Un avantage réglementaire décisif.",
            },
            {
              icon: Target,
              title: "Monétisation claire",
              desc: "Licences institutionnelles, comptes premium, et API pour intégrations tierces. Un modèle B2B éprouvé dans l'EdTech mondial.",
            },
          ].map((item, i) => (
            <Reveal key={i} delay={i * 0.15}>
              <div className="rounded-2xl border border-border bg-card p-8 text-center">
                <div className="mx-auto mb-5 inline-flex rounded-xl bg-primary/10 p-3 text-primary">
                  <item.icon className="h-6 w-6" />
                </div>
                <h3 className="mb-3 text-xl font-bold">{item.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ── CALL TO ACTION ────────────────────────────────────────────── */}
      <Section className="bg-muted/30">
        <Reveal>
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              Prêt à rejoindre la prochaine licorne éducative ?
            </h2>
            <p className="mt-6 text-lg text-muted-foreground">
              Que vous soyez étudiant, enseignant, administrateur ou investisseur — ATLAS a une place pour vous.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-8 py-3.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-xl active:scale-95"
              >
                Créer un compte gratuit
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="mailto:invest@atlas.tn"
                className="inline-flex items-center gap-2 rounded-full border border-border px-8 py-3.5 text-sm font-semibold transition-all hover:bg-muted active:scale-95"
              >
                Contacter l&apos;équipe
                <Mail className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </Reveal>
      </Section>

      {/* ── FOOTER ───────────────────────────────────────────────────── */}
      <footer className="border-t border-border bg-card py-12">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid gap-8 md:grid-cols-4">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <GraduationCap className="h-6 w-6 text-primary" />
                <span className="text-lg font-extrabold tracking-tight">ATLAS</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Plateforme académique augmentée par l&apos;IA. Conçue en Tunisie, pour le monde.
              </p>
            </div>
            <div>
              <h4 className="mb-3 text-sm font-semibold">Produit</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="/explore" className="hover:text-primary transition-colors">Explorer les cours</Link></li>
                <li><Link href="/login" className="hover:text-primary transition-colors">Connexion</Link></li>
                <li><Link href="/register" className="hover:text-primary transition-colors">Inscription</Link></li>
                <li><Link href="/status" className="hover:text-primary transition-colors">Statut du service</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-3 text-sm font-semibold">Entreprise</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="/blog" className="hover:text-primary transition-colors">Blog</Link></li>
                <li><Link href="/docs/guide" className="hover:text-primary transition-colors">Documentation</Link></li>
                <li><Link href="/privacy" className="hover:text-primary transition-colors">Confidentialité</Link></li>
                <li><Link href="/terms" className="hover:text-primary transition-colors">Conditions</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-3 text-sm font-semibold">Contact</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" /> Tunis, Tunisie
                </li>
                <li className="flex items-center gap-2">
                  <Mail className="h-4 w-4" /> contact@atlas.tn
                </li>
                <li className="flex items-center gap-2">
                  <Phone className="h-4 w-4" /> +216 00 000 000
                </li>
              </ul>
              <div className="mt-4 flex gap-4">
                <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                  <ExternalLink className="h-5 w-5" />
                </a>
                <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                  <ExternalLink className="h-5 w-5" />
                </a>
              </div>
            </div>
          </div>
          <div className="mt-12 border-t border-border pt-6 text-center text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} ATLAS. Tous droits réservés. Construit avec passion en Tunisie.
          </div>
        </div>
      </footer>
    </div>
  );
}
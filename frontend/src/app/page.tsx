"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  motion,
  useInView,
  useScroll,
  useTransform,
  AnimatePresence,
} from "framer-motion";
import {
  BookOpen,
  BrainCircuit,
  GraduationCap,
  GlobeLock,
  MessageSquareText,
  Sparkles,
  ChevronDown,
  ArrowRight,
  FileText,
  Layers,
  GitBranch,
  FileQuestion,
  BarChart3,
  ShieldCheck,
  Smartphone,
  Target,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  Quote,
  Menu,
  X,
  Download,
  Cpu,
  Lock,
  BadgeCheck,
} from "lucide-react";

/* ── TYPEWRITER HOOK (Optional, kept for flexibility) ─────────────── */
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
      setTextIndex((prev) => (prev + 1) % texts.length);
    }
    return () => clearTimeout(timeout);
  }, [charIndex, isDeleting, textIndex, texts, speed, deleteSpeed, pause]);

  useEffect(() => {
    setDisplayText(texts[textIndex % texts.length].substring(0, charIndex));
  }, [charIndex, textIndex, texts]);

  return displayText;
}

/* ── ANIMATED COUNTER WITH EASING ───────────────────────────────────── */
function AnimatedCounter({
  value,
  suffix = "",
  prefix = "",
  delay = 0,
}: {
  value: number;
  suffix?: string;
  prefix?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const start = performance.now();
    const duration = 2200;
    const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);

    const frame = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      setCount(Math.floor(easeOutQuart(progress) * value));
      if (progress < 1) requestAnimationFrame(frame);
    };
    const timeout = setTimeout(() => requestAnimationFrame(frame), delay);
    return () => clearTimeout(timeout);
  }, [inView, value, delay]);

  return (
    <span ref={ref} className="tabular-nums">
      {prefix}
      {count.toLocaleString("en-US")}
      {suffix}
    </span>
  );
}

/* ── WORD-BY-WORD REVEAL ────────────────────────────────────────────── */
function TextReveal({
  children,
  className = "",
  delay = 0,
}: {
  children: string;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const words = children.split(" ");

  return (
    <p ref={ref} className={className}>
      {words.map((word, i) => (
        <span key={i} className="inline-block overflow-hidden mr-[0.25em]">
          <motion.span
            className="inline-block"
            initial={{ y: "100%", opacity: 0 }}
            animate={inView ? { y: 0, opacity: 1 } : {}}
            transition={{
              duration: 0.5,
              delay: delay + i * 0.04,
              ease: [0.25, 0.46, 0.45, 0.94],
            }}
          >
            {word}
          </motion.span>
        </span>
      ))}
    </p>
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
    <section id={id} className={`relative py-28 md:py-36 ${className}`}>
      <div className="mx-auto max-w-7xl px-6 lg:px-8">{children}</div>
    </section>
  );
}

/* ── REVEAL ON SCROLL ─────────────────────────────────────────────────── */
function Reveal({
  children,
  delay = 0,
  className = "",
  direction = "up",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  direction?: "up" | "left" | "right";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  const initial =
    direction === "up"
      ? { opacity: 0, y: 50 }
      : direction === "left"
      ? { opacity: 0, x: -60 }
      : { opacity: 0, x: 60 };

  return (
    <motion.div
      ref={ref}
      initial={initial}
      animate={inView ? { opacity: 1, y: 0, x: 0 } : initial}
      transition={{ duration: 0.8, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ── CLEAN FEATURE CARD (Replaces SpotlightCard) ────────────────────── */
function FeatureCard({
  children,
  className = "",
  size = "normal",
}: {
  children: React.ReactNode;
  className?: string;
  size?: "normal" | "large" | "tall";
}) {
  const sizeClass =
    size === "large"
      ? "md:col-span-2 md:row-span-1"
      : size === "tall"
      ? "md:row-span-2"
      : "";

  return (
    <div
      className={`group relative overflow-hidden rounded-3xl border border-border bg-card p-8 transition-all duration-300 hover:border-primary/30 hover:shadow-lg ${sizeClass} ${className}`}
    >
      {children}
    </div>
  );
}

/* ── PIPELINE STEP ────────────────────────────────────────────────────── */
function PipelineStep({
  step,
  index,
  isLast,
}: {
  step: { icon: React.ElementType; label: string; desc: string; color: string };
  index: number;
  isLast: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, delay: index * 0.2 }}
      className="relative flex flex-col items-center text-center"
    >
      <div
        className={`relative z-10 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br ${step.color} shadow-lg ring-1 ring-white/20`}
      >
        <step.icon className="h-8 w-8 text-white" />
        <div className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-card border border-border text-xs font-bold text-primary shadow-sm">
          {index + 1}
        </div>
      </div>
      <h4 className="mt-5 text-lg font-bold">{step.label}</h4>
      <p className="mt-2 max-w-[200px] text-sm text-muted-foreground leading-relaxed">
        {step.desc}
      </p>
    </motion.div>
  );
}

/* ── TESTIMONIAL CARD ───────────────────────────────────────────────── */
function TestimonialCard({
  quote,
  author,
  role,
  delay = 0,
}: {
  quote: string;
  author: string;
  role: string;
  delay?: number;
}) {
  return (
    <Reveal delay={delay}>
      <div className="relative rounded-2xl border border-border bg-card p-8 transition-all duration-300 hover:border-primary/20 hover:shadow-lg">
        <Quote className="h-8 w-8 text-primary/20 mb-4" />
        <p className="text-foreground/90 leading-relaxed mb-6">"{quote}"</p>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/30 to-primary-light/20 flex items-center justify-center text-sm font-bold text-primary">
            {author.split(" ").map((n) => n[0]).join("")}
          </div>
          <div>
            <div className="text-sm font-semibold">{author}</div>
            <div className="text-xs text-muted-foreground">{role}</div>
          </div>
        </div>
      </div>
    </Reveal>
  );
}

/* ── NAVIGATION ─────────────────────────────────────────────────────── */
function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const links = [
    { href: "#solution", label: "Solution" },
    { href: "#how-it-works", label: "Process" },
    { href: "#features", label: "Features" },
  ];

  return (
    <motion.header
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? "bg-background/70 backdrop-blur-xl border-b border-border/50 shadow-lg shadow-black/5"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary-light text-primary-foreground shadow-lg shadow-primary/20 transition-transform group-hover:scale-110">
              <GraduationCap className="h-5 w-5" />
            </div>
            <span className="text-lg font-extrabold tracking-tight">ATLAS</span>
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors relative group"
              >
                {link.label}
                <span className="absolute -bottom-1 left-0 h-[2px] w-0 bg-primary transition-all duration-300 group-hover:w-full" />
              </Link>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <Link href="/auth/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-4 py-2">
              Sign in
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-xl active:scale-95"
            >
              Get Started
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 rounded-lg hover:bg-muted transition-colors"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden border-b border-border bg-background/95 backdrop-blur-xl"
          >
            <div className="px-6 py-4 space-y-3">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="block text-sm font-medium text-muted-foreground hover:text-foreground py-2"
                >
                  {link.label}
                </Link>
              ))}
              <div className="pt-3 border-t border-border flex flex-col gap-2">
                <Link href="/auth/login" className="text-sm font-medium py-2">Sign in</Link>
                <Link
                  href="/register"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
                >
                  Get Started <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
MAIN PAGE
═══════════════════════════════════════════════════════════════════════ */
export default function LandingPage() {
  const { scrollYProgress } = useScroll();
  const heroOpacity = useTransform(scrollYProgress, [0, 0.12], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 0.12], [1, 0.95]);
  const heroY = useTransform(scrollYProgress, [0, 0.12], [0, -30]);

  return (
    <div className="overflow-x-hidden bg-background text-foreground selection:bg-primary/20 selection:text-primary">
      <Navbar />

      {/* ── HERO ────────────────────────────────────────────────────── */}
      <motion.section
        style={{ opacity: heroOpacity, scale: heroScale, y: heroY }}
        className="relative min-h-screen flex flex-col justify-center items-center px-6 text-center pt-20"
      >
        <div className="relative z-10 max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-8 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-semibold text-primary backdrop-blur-sm"
          >
            <Sparkles className="h-4 w-4 animate-pulse" />
            Enterprise AI for Academia
            <span className="hidden sm:inline-flex items-center gap-1 ml-2 text-xs text-muted-foreground border-l border-primary/20 pl-2">
              <Cpu className="h-3 w-3" /> Sovereign Infrastructure
            </span>
          </motion.div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-extrabold tracking-tight leading-[1.05]">
            <motion.span
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1 }}
              className="block"
            >
              Transformez un{" "}
              <span className="text-primary">PDF</span>
            </motion.span>
            <motion.span
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.25 }}
              className="block mt-2"
            >
              en une{" "}
              <span className="bg-gradient-to-r from-primary via-primary-light to-primary bg-clip-text text-transparent">
                intelligence vivante
              </span>
            </motion.span>
          </h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="mt-8 max-w-2xl mx-auto text-lg sm:text-xl text-muted-foreground leading-relaxed"
          >
            ATLAS ingère vos cours, les comprend, et les transforme en tuteur
            personnel, quiz, flashcards et mind maps. Sans intermédiaire.
            Sans API externe. Juste votre savoir, amplifié.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.55 }}
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link
              href="/auth/login"
              className="group inline-flex items-center gap-2 rounded-full bg-primary px-8 py-4 text-sm font-semibold text-primary-foreground shadow-xl shadow-primary/25 transition-all hover:bg-primary/90 hover:shadow-2xl active:scale-95"
            >
              Commencer maintenant
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/auth/login"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card/50 backdrop-blur-sm px-8 py-4 text-sm font-semibold text-foreground transition-all hover:bg-muted active:scale-95"
            >
              <Download className="h-4 w-4" />
              Voir la démo
            </Link>
          </motion.div>
        </div>

        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-8"
        >
          <ChevronDown className="h-6 w-6 text-muted-foreground/40" />
        </motion.div>
      </motion.section>

      {/* ── PROBLEM STATEMENT ────────────────────────────────────────── */}
      <Section className="bg-muted/30" id="problem">
        <div className="mx-auto max-w-3xl text-center mb-20">
          <TextReveal
            className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight"
            delay={0.1}
          >
            L'éducation est bloquée dans le XXe siècle
          </TextReveal>
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4 }}
            className="mt-6 text-lg text-muted-foreground leading-relaxed"
          >
            Les étudiants naviguent encore avec des photocopies illisibles,
            des PDF statiques et des moteurs de recherche qui ne comprennent
            ni le contexte académique ni la langue.
          </motion.p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {[
            {
              icon: BookOpen,
              stat: "72%",
              label: "des étudiants tunisiens déclarent ne pas disposer d'outils numériques adaptés à leurs cours.",
            },
            {
              icon: BrainCircuit,
              stat: "3×",
              label: "plus de rétention en utilisant la répétition espacée par rapport à la relecture passive.",
            },

          ].map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: i * 0.15 }}
              className="relative overflow-hidden rounded-2xl border border-border bg-card p-8 text-center group hover:border-primary/20 transition-colors"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative">
                <div className="mx-auto mb-5 inline-flex rounded-2xl bg-primary/10 p-3.5 text-primary">
                  <item.icon className="h-7 w-7" />
                </div>
                <div className="text-5xl font-extrabold text-primary tabular-nums tracking-tight">
                  {item.stat}
                </div>
                <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
                  {item.label}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* ── SOLUTION PIPELINE ─────────────────────────────────────────── */}
      <Section id="solution">
        <div className="mx-auto max-w-3xl text-center mb-20">
          <TextReveal
            className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight"
            delay={0.1}
          >
            Le savoir rendu augmenté
          </TextReveal>
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            className="mt-6 text-lg text-muted-foreground leading-relaxed"
          >
            ATLAS ingère n'importe quel document pédagogique, le décompose en
            connaissances, et génère un écosystème complet d'outils d'étude.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-4">
          {[
            {
              icon: FileText,
              label: "Ingest",
              desc: "PDF, PPTX, DOCX, scans. OCR multi-modal avec Docling + MinerU.",
              color: "from-slate-500 to-slate-700",
            },
            {
              icon: Sparkles,
              label: "Extract",
              desc: "Texte, tableaux, équations, images. Support FR, EN, AR.",
              color: "from-primary to-primary-light",
            },
            {
              icon: BrainCircuit,
              label: "Reason",
              desc: "Vectorisation ColBERT + Graphe Neo4j + RAG hybride souverain.",
              color: "from-indigo-500 to-purple-500",
            },
            {
              icon: Layers,
              label: "Generate",
              desc: "Tuteur IA, flashcards, quiz, mind maps, résumés. Automatique.",
              color: "from-emerald-500 to-teal-500",
            },
          ].map((step, i) => (
            <PipelineStep key={i} step={step} index={i} isLast={i === 3} />
          ))}
        </div>
      </Section>

      {/* ── HOW IT WORKS (Sticky Scroll) ─────────────────────────────── */}
      <Section className="bg-muted/30" id="how-it-works">
        <div className="mx-auto max-w-3xl text-center mb-24">
          <TextReveal
            className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight"
            delay={0.1}
          >
            Comment ça marche
          </TextReveal>
        </div>

        <div className="space-y-32">
          {/* Step 1 */}
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <Reveal direction="left">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary mb-4">
                <FileText className="h-3.5 w-3.5" /> Étape 1
              </div>
              <h3 className="text-3xl lg:text-4xl font-extrabold tracking-tight mb-4">
                Déposez un cours.
              </h3>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Un enseignant upload un PDF, PPTX, DOCX ou même un scan manuscrit.
                Notre pipeline multi-modal extrait le texte, les tableaux, les équations
                et les images — en Français, Anglais, ou Arabe.
              </p>
            </Reveal>
            <Reveal direction="right" delay={0.2}>
              <div className="rounded-2xl border border-border bg-card p-8 shadow-xl">
                <div className="flex items-center gap-4 mb-6">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <FileText className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="font-semibold">Cours_Algebre_1.pdf</div>
                    <div className="text-sm text-muted-foreground">12.4 MB · 142 pages</div>
                  </div>
                  <div className="ml-auto">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
                      <BadgeCheck className="h-5 w-5" />
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">OCR Multi-modal</span>
                    <span className="font-medium text-primary">Terminé</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <motion.div
                      initial={{ width: "0%" }}
                      whileInView={{ width: "100%" }}
                      viewport={{ once: true }}
                      transition={{ duration: 2, ease: "easeInOut" }}
                      className="h-full rounded-full bg-gradient-to-r from-primary to-primary-light"
                    />
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground pt-2">
                    <span>1,423 chunks indexés</span>
                    <span>·</span>
                    <span>87 entités extraites</span>
                    <span>·</span>
                    <span>3 langues détectées</span>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>

          {/* Step 2 */}
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <Reveal direction="right" className="lg:order-2">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary mb-4">
                <BrainCircuit className="h-3.5 w-3.5" /> Étape 2
              </div>
              <h3 className="text-3xl lg:text-4xl font-extrabold tracking-tight mb-4">
                L'IA comprend le cours.
              </h3>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Le contenu est vectorisé avec ColBERT MaxSim, lié à un graphe de
                connaissances Neo4j et indexé en recherche full-text. Notre moteur
                RAG hybride raisonne sur votre cours, pas sur Internet.
              </p>
            </Reveal>
            <Reveal direction="left" delay={0.2} className="lg:order-1">
              <div className="rounded-2xl border border-border bg-card p-6 space-y-4 shadow-xl">
                {[
                  { label: "ColBERT MaxSim · Qdrant · 128d", active: true },
                  { label: "Neo4j · Knowledge Graph · 87 nœuds", active: false },
                  { label: "Meilisearch · Full-Text · FR/EN/AR", active: false },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-xl bg-muted/40 p-4 border border-border/40">
                    <div className={`h-2.5 w-2.5 rounded-full ${item.active ? "bg-emerald-500 animate-pulse" : "bg-primary/40"}`} />
                    <span className="text-sm font-mono text-muted-foreground">{item.label}</span>
                  </div>
                ))}
                <div className="h-40 rounded-xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent flex items-center justify-center border border-primary/10">
                  <div className="text-center">
                    <Sparkles className="h-10 w-10 text-primary mx-auto mb-2" />
                    <span className="text-sm font-medium text-primary">Sovereign RAG Active</span>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>

          {/* Step 3 */}
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <Reveal direction="left">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary mb-4">
                <MessageSquareText className="h-3.5 w-3.5" /> Étape 3
              </div>
              <h3 className="text-3xl lg:text-4xl font-extrabold tracking-tight mb-4">
                Posez une question.
              </h3>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Le tuteur IA répond en streaming, token par token, en citant la page
                exacte du cours. Il s'adapte au niveau, à la filière et à la langue
                de l'étudiant. Aucune donnée ne quitte le GPU souverain.
              </p>
            </Reveal>
            <Reveal direction="right" delay={0.2}>
              <div className="rounded-2xl border border-border bg-card p-6 shadow-xl space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 h-9 w-9 rounded-full bg-gradient-to-br from-primary to-primary-light flex items-center justify-center text-primary-foreground text-xs font-bold shadow-lg shadow-primary/20">
                    AI
                  </div>
                  <div className="flex-1 rounded-xl bg-muted/50 p-4 border border-border/40">
                    <p className="text-sm leading-relaxed text-foreground/90">
                      D'après le <span className="font-semibold text-primary">chapitre 3, page 47</span>, la récursivité se définit comme
                      une fonction qui s'appelle elle-même avec un cas de base pour
                      terminer l'exécution.
                    </p>
                    <div className="mt-3 p-3 rounded-lg bg-background border border-border/60 font-mono text-xs text-muted-foreground">
                      def factorial(n): <br />
                      &nbsp;&nbsp;if n == 0: return 1 <br />
                      &nbsp;&nbsp;return n * factorial(n-1)
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground pl-12">
                  <Lock className="h-3 w-3" />
                  <span>Source: Cours_Algebre_1.pdf · Chapitre 3 · Page 47</span>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </Section>

      

      {/* ── TESTIMONIALS ──────────────────────────────────────────────── */}
      <Section>
        <div className="mx-auto max-w-3xl text-center mb-16">
          <TextReveal
            className="text-3xl sm:text-4xl font-extrabold tracking-tight"
            delay={0.1}
          >
            Ils utilisent ATLAS chaque jour
          </TextReveal>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          <TestimonialCard
            quote="ATLAS a complètement changé ma façon de réviser. Le tuteur IA me permet de comprendre des concepts que je n'avais pas saisis en cours."
            author="Amira Ben Salah"
            role="Étudiante en Médecine · Université de Tunis"
            delay={0}
          />
          <TestimonialCard
            quote="J'upload mes cours le vendredi, et lundi mes étudiants ont déjà des flashcards et des quiz. C'est un gain de temps incroyable."
            author="Dr. Karim Mzoughi"
            role="Enseignant-chercheur · Université de Sfax"
            delay={0.15}
          />
          <TestimonialCard
            quote="La souveraineté des données était notre priorité. ATLAS est le seul outil qui garantit que nos contenus restent en Tunisie."
            author="Prof. Leila Trabelsi"
            role="Doyenne · Université de Carthage"
            delay={0.3}
          />
        </div>
      </Section>



      {/* ── CALL TO ACTION ────────────────────────────────────────────── */}
      <Section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-primary-light/5" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-primary/10 blur-[120px] pointer-events-none" />

        <div className="relative mx-auto max-w-3xl text-center">
          <TextReveal
            className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight"
            delay={0.1}
          >
            Prêt à rejoindre la prochaine licorne éducative
          </TextReveal>
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            className="mt-6 text-lg text-muted-foreground"
          >
            Que vous soyez étudiant, enseignant, administrateur ou investisseur — ATLAS a une place pour vous.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 }}
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link
              href="/register"
              className="group inline-flex items-center gap-2 rounded-full bg-primary px-8 py-4 text-sm font-semibold text-primary-foreground shadow-xl shadow-primary/25 transition-all hover:bg-primary/90 hover:shadow-2xl active:scale-95"
            >
              Créer un compte gratuit
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="mailto:invest@atlas.tn"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 backdrop-blur-sm px-8 py-4 text-sm font-semibold transition-all hover:bg-muted active:scale-95"
            >
              Contacter l'équipe
              <Mail className="h-4 w-4" />
            </Link>
          </motion.div>
        </div>
      </Section>

      {/* ── FOOTER ───────────────────────────────────────────────────── */}
      <footer className="border-t border-border bg-card">
        <div className="mx-auto max-w-7xl px-6 lg:px-8 py-16">
          <div className="grid gap-12 md:grid-cols-4">
            <div className="md:col-span-1">
              <div className="flex items-center gap-2 mb-5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary-light text-primary-foreground shadow-lg shadow-primary/20">
                  <GraduationCap className="h-5 w-5" />
                </div>
                <span className="text-lg font-extrabold tracking-tight">ATLAS</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Plateforme académique augmentée par l'IA. Conçue en Tunisie, pour le monde.
              </p>
            </div>
            <div>
              <h4 className="mb-4 text-sm font-semibold">Produit</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><Link href="/explore" className="hover:text-primary transition-colors">Explorer les cours</Link></li>
                <li><Link href="/login" className="hover:text-primary transition-colors">Connexion</Link></li>
                <li><Link href="/register" className="hover:text-primary transition-colors">Inscription</Link></li>
                <li><Link href="/status" className="hover:text-primary transition-colors">Statut du service</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-4 text-sm font-semibold">Entreprise</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><Link href="/blog" className="hover:text-primary transition-colors">Blog</Link></li>
                <li><Link href="/docs/guide" className="hover:text-primary transition-colors">Documentation</Link></li>
                <li><Link href="/privacy" className="hover:text-primary transition-colors">Confidentialité</Link></li>
                <li><Link href="/terms" className="hover:text-primary transition-colors">Conditions</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-4 text-sm font-semibold">Contact</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary/60" /> Sfax, Tunisie
                </li>
                <li className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-primary/60" /> contact@atlas.tn
                </li>
                <li className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-primary/60" /> +216 00 000 000
                </li>
              </ul>
              <div className="mt-6 flex gap-4">
                <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg bg-muted/50 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all">
                  <ExternalLink className="h-4 w-4" />
                </a>
                <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg bg-muted/50 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
          </div>
          <div className="mt-16 border-t border-border pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
            <p>&copy; {new Date().getFullYear()} ATLAS. Tous droits réservés.</p>
            <p className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Système opérationnel · Latence 128ms
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { 
  Globe, 
  GraduationCap
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRTL } from "@/hooks/use-rtl";
import { useTranslation } from "@/hooks/use-translation";
import { useSystemHealth } from "@/hooks/use-system-health";
import { SystemStatusDot } from "@/components/ui/system-status-dot";

// Dynamic imports for social icons to reduce bundle size
import dynamic from "next/dynamic";
const FaXTwitter = dynamic(() => import('react-icons/fa6').then(mod => ({ default: mod.FaXTwitter })));
const FaGithub = dynamic(() => import('react-icons/fa6').then(mod => ({ default: mod.FaGithub })));
const FaLinkedin = dynamic(() => import('react-icons/fa6').then(mod => ({ default: mod.FaLinkedin })));
const FaInstagram = dynamic(() => import('react-icons/fa6').then(mod => ({ default: mod.FaInstagram })));
const FaFacebook = dynamic(() => import('react-icons/fa6').then(mod => ({ default: mod.FaFacebook })));

/**
 * Atomic Footer Link Component with Analytics
 */
function FooterLink({ 
  href, 
  children, 
  external, 
  onClick 
}: { 
  href: string; 
  children: React.ReactNode; 
  external?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <span className="relative inline-block transition-colors hover:text-foreground after:absolute after:bottom-0 after:inset-inline-start-0 after:h-[1px] after:w-0 after:bg-primary after:transition-all hover:after:w-full">
      {children}
    </span>
  );

  const handleClick = () => {
    onClick?.();
  };

  if (external) {
    return (
      <li>
        <a 
          href={href} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="text-sm text-muted-foreground transition-colors"
          onClick={handleClick}
        >
          {content}
        </a>
      </li>
    );
  }

  return (
    <li>
      <Link 
        href={href} 
        className="text-sm text-muted-foreground transition-colors"
        onClick={handleClick}
      >
        {content}
      </Link>
    </li>
  );
}

/**
 * Footer Column Wrapper
 */
function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <h4 className="text-sm font-bold uppercase tracking-wider text-foreground/80">{title}</h4>
      <nav aria-label={title}>
        <ul className="flex flex-col gap-3">
          {children}
        </ul>
      </nav>
    </div>
  );
}

/**
 * Enhanced Language Selector with Keyboard Navigation
 */
function LanguageSelector() {
  const { lang, setLanguage, languageNames } = useRTL();
  const [isOpen, setIsOpen] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
    } else if (e.key === 'ArrowDown' && !isOpen) {
      setIsOpen(true);
    }
  };

  const handleLanguageSelect = (language: "en" | "fr" | "ar") => {
    setLanguage(language);
    setIsOpen(false);
  };

  return (
    <div className="relative mt-6">
      <button
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        className="flex items-center gap-2 rounded-md border bg-background/50 px-3 py-1.5 text-sm font-medium transition-all hover:bg-background"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label="Select language"
      >
        <Globe className="h-4 w-4" />
        <span>{languageNames[lang]}</span>
      </button>

      {isOpen && (
        <div
          className="absolute bottom-full mb-2 w-32 rounded-lg border bg-background p-1 shadow-xl animate-in fade-in slide-in-from-bottom-2"
          role="listbox"
          aria-label="Language options"
        >
          {(["en", "fr", "ar"] as const).map((l) => (
            <button
              key={l}
              onClick={() => handleLanguageSelect(l)}
              className={cn(
                "w-full rounded-md px-3 py-2 text-start transition-colors hover:bg-muted",
                lang === l && "bg-muted font-semibold text-primary"
              )}
              role="option"
              aria-selected={lang === l}
            >
              {languageNames[l]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Footer({ variant = "full" }: { variant?: "full" | "minimal" }) {
  const { t, tSection } = useTranslation();
  const footerRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const currentYear = new Date().getFullYear();

  // Intersection observer for performance optimization
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0.1 }
    );

    if (footerRef.current) {
      observer.observe(footerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // Use the new system health hook
  const { status: overallStatus } = useSystemHealth(variant === "full", isVisible);

  const navT = tSection("nav");
  const commonT = tSection("common");

  // Analytics tracking function
  const trackFooterClick = (linkName: string) => {
    // TODO: Implement analytics tracking
    // analytics.track('footer_link_click', { link: linkName, variant });
  };

  if (variant === "minimal") {
    return (
      <footer className="border-t bg-card/30 py-4" role="contentinfo">
        <div className="container mx-auto px-6">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <p className="text-xs font-medium text-muted-foreground">
              {commonT.copyright.replace("{year}", currentYear.toString())}
            </p>
            <nav aria-label="Footer navigation">
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <Link href="/privacy" className="hover:text-primary transition-colors" onClick={() => trackFooterClick('privacy')}>
                  {navT.privacy}
                </Link>
                <Link href="/terms" className="hover:text-primary transition-colors" onClick={() => trackFooterClick('terms')}>
                  {navT.terms}
                </Link>
                <Link href="/docs/guide" className="hover:text-primary transition-colors" onClick={() => trackFooterClick('help')}>
                  {navT.help}
                </Link>
              </div>
            </nav>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer
      ref={footerRef}
      className="border-t bg-card/50 backdrop-blur-sm"
      role="contentinfo"
    >
      <div className="container mx-auto px-6 py-16">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-2 lg:grid-cols-12 lg:gap-8">
          
          {/* Brand Column */}
          <div className="flex flex-col items-start lg:col-span-4">
            <Link
              href="/"
              className="group flex items-center gap-3"
              onClick={() => trackFooterClick('brand')}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-glow transition-transform duration-200 group-hover:scale-105">
                <GraduationCap className="h-6 w-6" />
              </div>
              <span className="text-2xl font-black tracking-tighter">ATLAS</span>
            </Link>
            
            <p className="mt-6 max-w-xs text-balance text-sm leading-relaxed text-muted-foreground">
              {commonT.description}
            </p>

            <div className="mt-8">
              <SystemStatusDot 
                status={overallStatus} 
                className="rounded-full bg-background/50 px-3 py-1 border shadow-sm"
              />
            </div>

            <LanguageSelector />
          </div>

          {/* Links Columns - Improved mobile responsiveness */}
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:col-span-8 lg:grid-cols-4">
            <FooterColumn title={navT.learn}>
              <FooterLink href="/courses" onClick={() => trackFooterClick('catalog')}>
                {navT.catalog}
              </FooterLink>
              <FooterLink href="/docs/guide" onClick={() => trackFooterClick('dashboard')}>
                {navT.dashboard}
              </FooterLink>
              <FooterLink href="/resources" onClick={() => trackFooterClick('resources')}>
                {navT.resources}
              </FooterLink>
              <FooterLink href="/calendar" onClick={() => trackFooterClick('calendar')}>
                {navT.calendar}
              </FooterLink>
            </FooterColumn>

            <FooterColumn title={navT.teach}>
              <FooterLink href="/teacher/upload" onClick={() => trackFooterClick('upload')}>
                {navT.upload}
              </FooterLink>
              <FooterLink href="/teacher/analytics" onClick={() => trackFooterClick('analytics')}>
                {navT.analytics}
              </FooterLink>
              <FooterLink href="/teacher/guidelines" onClick={() => trackFooterClick('guidelines')}>
                {navT.guidelines}
              </FooterLink>
            </FooterColumn>

            <FooterColumn title={navT.engineering}>
              <FooterLink href="/api/docs" external onClick={() => trackFooterClick('api_docs')}>
                {navT.apiDocs}
              </FooterLink>
              <FooterLink href="/status" onClick={() => trackFooterClick('system_status')}>
                {navT.systemStatus}
              </FooterLink>
              <FooterLink href="/dev" onClick={() => trackFooterClick('dev_portal')}>
                {navT.devPortal}
              </FooterLink>
              <FooterLink href="/blog" onClick={() => trackFooterClick('blog')}>
                {navT.blog}
              </FooterLink>
            </FooterColumn>

            <FooterColumn title={navT.trust}>
              <FooterLink href="/docs/guide" onClick={() => trackFooterClick('help')}>
                {navT.help}
              </FooterLink>
              <FooterLink href="/privacy" onClick={() => trackFooterClick('privacy')}>
                {navT.privacy}
              </FooterLink>
              <FooterLink href="/terms" onClick={() => trackFooterClick('terms')}>
                {navT.terms}
              </FooterLink>
              <FooterLink href="/accessibility" onClick={() => trackFooterClick('accessibility')}>
                {navT.accessibility}
              </FooterLink>
            </FooterColumn>
          </div>
        </div>

        {/* Bottom Bar with Real Social Links */}
        <div className="mt-16 flex flex-col items-center justify-between gap-6 border-t pt-8 md:flex-row">
          <p className="text-sm font-medium text-muted-foreground">
            {commonT.copyright.replace("{year}", currentYear.toString())}
          </p>
          
          <nav aria-label="Social media links">
            <div className="flex items-center gap-5">
              {[
                { Icon: FaXTwitter, href: "https://twitter.com/atlas_tn", label: "Follow us on Twitter" },
                { Icon: FaGithub, href: "https://github.com/atlas-tn", label: "View our GitHub repository" },
                { Icon: FaLinkedin, href: "https://linkedin.com/company/atlas-tn", label: "Connect with us on LinkedIn" },
                { Icon: FaInstagram, href: "https://instagram.com/atlas_tn", label: "Follow us on Instagram" },
                { Icon: FaFacebook, href: "https://facebook.com/atlas.tn", label: "Like us on Facebook" },
              ].map(({ Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  className="group relative flex h-8 w-8 items-center justify-center rounded-lg border bg-background/50 text-muted-foreground transition-all duration-200 hover:border-primary hover:text-primary hover:shadow-glow"
                  aria-label={label}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackFooterClick(`social_${label.toLowerCase().split(' ')[0]}`)}
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </nav>
        </div>
      </div>
    </footer>
  );
}

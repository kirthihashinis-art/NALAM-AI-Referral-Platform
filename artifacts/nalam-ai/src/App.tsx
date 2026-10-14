import { createContext, useContext, useEffect, useState, type ReactNode, type FormEvent } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  Activity, ArrowRight, Building2, CalendarClock,
  Check, CheckCircle2, CircleHelp, ClipboardList, Clock3, FileChartColumn,
  HeartHandshake, Hospital, Languages, LayoutDashboard, LockKeyhole, LogOut,
  MessageSquareText, Plus, Search, ShieldCheck, Users, X,
} from 'lucide-react';
import {
  getGetCurrentUserQueryKey, getGetDashboardSummaryQueryKey, getListFacilitiesQueryKey,
  getListFollowupsQueryKey, getListPatientsQueryKey, getListReferralsQueryKey,
  getListUsersQueryKey, useCreateFacility, useCreateFollowup, useCreateReferral,
  useGetAssistantReply, useGetCurrentUser, useGetDashboardSummary, useListFacilities,
  useListFollowups, useListPatients, useListReferrals, useListUsers,
  useUpdateFacility, useUpdateFollowup, useUpdateReferralStatus, useUpdateUserRole,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter, Link, Redirect, useLocation } from 'wouter';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
function stripBase(path: string) { return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path; }

const appearance = {
  theme: shadcn, cssLayerName: 'clerk',
  options: { logoPlacement: 'inside' as const, logoLinkUrl: basePath || '/', logoImageUrl: `${window.location.origin}${basePath}/logo.svg` },
  variables: {
    colorPrimary: '#28736d', colorForeground: '#193b3b', colorMutedForeground: '#687b78',
    colorDanger: '#b84e46', colorBackground: '#fbf9ef', colorInput: '#fffdf6',
    colorInputForeground: '#193b3b', colorNeutral: '#d8d7c9', fontFamily: 'DM Sans, sans-serif', borderRadius: '0.7rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center', cardBox: 'bg-[#fbf9ef] rounded-2xl w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none', footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#193b3b] font-bold', headerSubtitle: 'text-[#687b78]',
    socialButtonsBlockButtonText: 'text-[#193b3b] font-semibold', formFieldLabel: 'text-[#193b3b] font-semibold',
    footerActionLink: 'text-[#28736d] font-bold', footerActionText: 'text-[#687b78]', dividerText: 'text-[#687b78]',
    identityPreviewEditButton: 'text-[#28736d]', formFieldSuccessText: 'text-[#28736d]', alertText: 'text-[#193b3b]',
    logoBox: 'rounded-xl', logoImage: 'rounded-xl', socialButtonsBlockButton: 'border-[#d8d7c9] bg-[#fffdf6]',
    formButtonPrimary: 'bg-[#28736d] hover:bg-[#215e59]', formFieldInput: 'border-[#d8d7c9] bg-[#fffdf6]',
    footerAction: 'text-[#687b78]', dividerLine: 'bg-[#d8d7c9]', alert: 'border-[#d8d7c9]',
    otpCodeFieldInput: 'border-[#d8d7c9] bg-[#fffdf6]', formFieldRow: 'gap-2', main: 'gap-5',
  },
};

type Language = 'en' | 'ta';
const copy = {
  en: { dashboard: 'Overview', patients: 'Patients', referrals: 'Referrals', followups: 'Follow-ups', facilities: 'Facilities', reports: 'Reports', settings: 'Team access', assistant: 'Help assistant', today: 'Today', greeting: 'Good day', search: 'Search', signIn: 'Sign in', createAccount: 'Create account' },
  ta: { dashboard: 'கண்ணோட்டம்', patients: 'நோயாளிகள்', referrals: 'பரிந்துரைகள்', followups: 'தொடர் பார்வைகள்', facilities: 'மையங்கள்', reports: 'அறிக்கைகள்', settings: 'குழு அணுகல்', assistant: 'உதவி', today: 'இன்று', greeting: 'வணக்கம்', search: 'தேடுக', signIn: 'உள்நுழைக', createAccount: 'கணக்கு உருவாக்கு' },
};
const LanguageContext = createContext<Language>('en');
const taText: Record<string, string> = {
  'Overview': 'கண்ணோட்டம்', 'Patients': 'நோயாளிகள்', 'Referrals': 'பரிந்துரைகள்', 'Follow-ups': 'தொடர் பார்வைகள்',
  'Facilities': 'மையங்கள்', 'Reports': 'அறிக்கைகள்', 'Team access': 'குழு அணுகல்', 'Help assistant': 'உதவி',
  'A clear view of care in motion': 'நடைபெறும் பராமரிப்பின் தெளிவான பார்வை',
  'Saved referral totals and the follow-ups that need attention.': 'சேமிக்கப்பட்ட பரிந்துரை எண்ணிக்கையும் கவனம் தேவைப்படும் தொடர் பார்வைகளும்.',
  'Find saved patient records available to your account.': 'உங்கள் கணக்கிற்கான சேமிக்கப்பட்ட நோயாளர் பதிவுகளைத் தேடுங்கள்.',
  'Search referral records and keep each destination accountable.': 'பரிந்துரை பதிவுகளைத் தேடி, ஒவ்வொரு இடத்தையும் பொறுப்புடன் கண்காணிக்கவும்.',
  'See upcoming visits, overdue actions and completed follow-ups.': 'வரவிருக்கும் சந்திப்புகள், தாமதமான செயல்கள் மற்றும் முடிந்த தொடர் பார்வைகளைப் பாருங்கள்.',
  'PHCs and hospitals available as referral destinations.': 'பரிந்துரை இலக்குகளாக உள்ள ஆரம்ப சுகாதார மையங்கள் மற்றும் மருத்துவமனைகள்.',
  'Facility-level referral activity, based on saved records.': 'சேமிக்கப்பட்ட பதிவுகளின் அடிப்படையிலான மைய வாரியான பரிந்துரை விவரம்.',
  'Assign each colleague a role and, when needed, a facility.': 'ஒவ்வொரு குழு உறுப்பினருக்கும் பங்கையும் தேவையான மையத்தையும் ஒதுக்குங்கள்.',
  'Ask about using the platform and referral workflow.': 'தளத்தையும் பரிந்துரை செயல்முறையையும் பயன்படுத்துவது பற்றி கேளுங்கள்.',
  'New referral': 'புதிய பரிந்துரை', 'Schedule follow-up': 'தொடர் பார்வையை திட்டமிடு',
  'All referrals': 'அனைத்து பரிந்துரைகள்', 'Needs attention': 'கவனம் தேவை', 'Overdue follow-ups': 'தாமதமான தொடர் பார்வைகள்',
  'Pending': 'நிலுவையில்', 'In progress': 'நடைபெறுகிறது', 'Completed': 'முடிந்தது',
  'All visits': 'அனைத்து சந்திப்புகள்', 'upcoming': 'வரவிருக்கும்', 'overdue': 'தாமதமானது',
  'administrator': 'நிர்வாகி', 'health worker': 'சுகாதாரப் பணியாளர்', 'facility staff': 'மையப் பணியாளர்',
  'Team member': 'குழு உறுப்பினர்', 'Active': 'செயலில்', 'Inactive': 'செயலற்றது',
  'Where care stands': 'பராமரிப்பின் நிலை', 'Referral activity by facility': 'மைய வாரியான பரிந்துரை நிலை',
  'Your account is awaiting access': 'உங்கள் கணக்கிற்கு அணுகல் காத்திருக்கிறது',
  'No patient records': 'நோயாளர் பதிவுகள் இல்லை', 'No referrals found': 'பரிந்துரைகள் இல்லை',
  'No follow-ups in this view': 'இந்த பார்வையில் தொடர் சந்திப்புகள் இல்லை',
  'Patient ID': 'நோயாளர் அடையாள எண்', 'Patient name': 'நோயாளர் பெயர்', 'Age': 'வயது',
  'Contact number': 'தொடர்பு எண்', 'Referral destination': 'பரிந்துரை இலக்கு',
  'Referral date': 'பரிந்துரை தேதி', 'Reason for referral': 'பரிந்துரைக்கான காரணம்',
  'Search patient or destination': 'நோயாளர் அல்லது இலக்கைத் தேடுக',
  'All statuses': 'அனைத்து நிலைகளும்', 'All facilities': 'அனைத்து மையங்களும்',
  'From': 'இருந்து', 'To': 'வரை', 'Clear filters': 'வடிகட்டிகளை நீக்கு',
  'Create a referral': 'பரிந்துரையை உருவாக்கு', 'Save referral': 'பரிந்துரையைச் சேமி',
  'Search by name or patient ID': 'பெயர் அல்லது நோயாளர் அடையாள எண்ணால் தேடுக',
  'Referral ID': 'பரிந்துரை எண்', 'Facility': 'மையம்', 'Visit date': 'சந்திப்பு தேதி',
  'Notes': 'குறிப்புகள்', 'Save follow-up': 'தொடர் சந்திப்பைச் சேமி',
  'Mark in progress': 'செயல்பாட்டில் எனக் குறி', 'Mark done': 'முடிந்தது எனக் குறி',
  'Edit details': 'விவரங்களைத் திருத்து', 'Deactivate': 'செயலிழக்கச் செய்',
  'Activate': 'செயல்படுத்து', 'No facilities have been saved': 'மைய விவரங்கள் இல்லை',
  'Patient': 'நோயாளர்', 'Destination': 'இலக்கு', 'Contact': 'தொடர்பு',
  'Added': 'சேர்க்கப்பட்ட தேதி', 'Reason': 'காரணம்', 'Status': 'நிலை',
  'Next action': 'அடுத்த செயல்', 'Scheduled date': 'திட்டமிட்ட தேதி',
  'State': 'நிலை', 'Action': 'செயல்', 'Select facility': 'மையத்தைத் தேர்ந்தெடுக்கவும்',
  'pending': 'நிலுவையில்', 'in progress': 'நடைபெறுகிறது', 'completed': 'முடிந்தது',
};
const translate = (text: string, language: Language) => language === 'ta' ? (taText[text] || text) : text;
const navItems = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/patients', label: 'Patients', icon: Users },
  { href: '/referrals', label: 'Referrals', icon: HeartHandshake },
  { href: '/follow-ups', label: 'Follow-ups', icon: CalendarClock },
  { href: '/facilities', label: 'Facilities', icon: Building2 },
  { href: '/reports', label: 'Reports', icon: FileChartColumn },
  { href: '/settings', label: 'Team access', icon: ShieldCheck, admin: true },
  { href: '/assistant', label: 'Help assistant', icon: MessageSquareText },
];
const dateToday = () => {
  const localDate = new Date();
  localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
  return localDate.toISOString().slice(0, 10);
};
const displayDate = (date?: string) => date ? new Date(`${date.slice(0,10)}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const roleText = (role?: string) => role?.replaceAll('_', ' ') ?? 'pending';

function Brand({ inverse = false }: { inverse?: boolean }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: inverse ? '#fbf8e9' : '#193b3b' }}>
    <div className="brand-mark">N</div><div><div style={{ fontFamily: 'var(--app-font-serif)', fontWeight: 800, letterSpacing: '-.045em', fontSize: 18 }}>NALAM <span style={{ color: '#df995e' }}>AI</span></div><div style={{ fontSize: 9, letterSpacing: '.13em', opacity: .68, textTransform: 'uppercase' }}>Care, connected</div></div>
  </div>;
}

function PageHeading({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  const language = useContext(LanguageContext);
  return <div className="topbar"><div><div className="eyebrow">NALAM AI · CARE COORDINATION</div><h1 className="page-title" style={{ marginTop: 8 }}>{translate(title, language)}</h1><p className="muted" style={{ margin: '8px 0 0', fontSize: 14 }}>{translate(description, language)}</p></div>{action}</div>;
}
function LoadingPanel({ count = 3 }: { count?: number }) {
  return <div className="panel" style={{ padding: 22, display: 'grid', gap: 16 }} aria-label="Loading saved information">{Array.from({ length: count }, (_, i) => <div key={i} className="skeleton" style={{ width: `${82 - i * 10}%` }} />)}</div>;
}
function QueryState({ loading, error, retry, children, empty, emptyTitle = 'Nothing here yet' }: { loading: boolean; error: unknown; retry: () => void; children: ReactNode; empty?: boolean; emptyTitle?: string }) {
  if (loading) return <LoadingPanel />;
  if (error) return <div className="panel error-state"><div style={{ color: 'hsl(var(--destructive))', fontWeight: 700 }}>Saved information could not be loaded</div><p className="small-note">Your records have not been changed. Check your connection and try again.</p><button className="btn secondary small" onClick={retry} data-testid="button-retry-load">Try again</button></div>;
  if (empty) return <div className="panel empty-state"><div style={{ width: 44, height: 44, borderRadius: 14, display: 'grid', placeItems: 'center', background: '#e6eee7', color: '#28736d', margin: '0 auto 12px' }}><ClipboardList size={21} /></div><strong style={{ color: 'hsl(var(--foreground))' }}>{emptyTitle}</strong><p className="small-note">When information is saved, it will appear here.</p></div>;
  return <>{children}</>;
}
function FormNotice({ error, success }: { error?: unknown; success?: string }) {
  if (!error && !success) return null;
  return <div role="status" className="callout" style={{ marginTop: 12, borderColor: error ? '#b84e46' : '#28736d', background: error ? '#f8e9e4' : '#e4eee7', color: '#354b45' }}>{error ? 'This change was not saved. Please check the information and try again.' : success}</div>;
}

function Home() {
  const [language, setLanguage] = useState<Language>('en');
  const words = copy[language];
  return <main style={{ minHeight: '100dvh' }}>
   <header className="public-nav"><Link href="/" style={{ textDecoration: 'none' }}><Brand /></Link><div className="public-nav-actions" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <button className="btn secondary small" onClick={() => setLanguage(language === 'en' ? 'ta' : 'en')} aria-label="Switch language" data-testid="button-language"><Languages size={15} />{language === 'en' ? 'தமிழ்' : 'English'}</button>
      <Link className="btn secondary small" href="/sign-in">{words.signIn}</Link><Link className="btn small" href="/sign-up">{words.createAccount}<ArrowRight size={15} /></Link>
    </div></header>
    <div className="public-wrap">
      <section className="hero-grid" style={{ padding: '54px 0 80px' }}>
        <div><div className="eyebrow">A clearer path from referral to care</div><h1 className="hero-title">Every referral.<br /><span>A next step.</span></h1>
          <p style={{ fontSize: 18, lineHeight: 1.65, maxWidth: 540, color: '#526663' }}>NALAM helps community health workers and care teams keep referrals moving—with a named destination, a visible status and a follow-up that stays on the list.</p>
          <div style={{ display: 'flex', gap: 12, marginTop: 27, flexWrap: 'wrap' }}><Link className="btn" href="/sign-up">Join your care team<ArrowRight size={16} /></Link><Link className="btn secondary" href="/sign-in">Sign in to NALAM</Link></div>
          <p className="small-note" style={{ marginTop: 20, maxWidth: 470 }}><LockKeyhole size={13} style={{ verticalAlign: 'middle', marginRight: 6 }} />Preview records are fictional. Never enter real patient information during the demo. In a live service, patient details are only for authorized care coordination.</p>
        </div>
        <div className="hero-orbit" aria-label="A connected care pathway illustration"><div className="orbit-core"><div style={{ textAlign: 'center' }}><HeartHandshake size={35} /><div style={{ fontSize: 11, marginTop: 8, fontWeight: 700 }}>CARE PATH</div></div></div><div className="hero-chip one">Community worker</div><div className="hero-chip two">Referral sent</div><div className="hero-chip three">PHC / hospital</div><div className="hero-chip four">Follow-up due</div></div>
      </section>
      <section className="grid-3 section-space">
        {[{ n: '01', t: 'Send with clarity', d: 'Capture the reason for referral and the intended care destination in one readable record.' }, { n: '02', t: 'Know who has it', d: 'See whether a referral is pending, in progress or completed—without chasing paper.' }, { n: '03', t: 'Keep the next visit visible', d: 'Schedule follow-ups and see overdue work before it gets lost in a busy day.' }].map(item => <article className="panel" style={{ padding: 23 }} key={item.n}><div className="eyebrow">{item.n} / THE WORKFLOW</div><h2 style={{ font: '700 20px var(--app-font-serif)', margin: '17px 0 8px' }}>{item.t}</h2><p className="muted" style={{ lineHeight: 1.65, fontSize: 14, margin: 0 }}>{item.d}</p></article>)}
      </section>
      <section className="grid-2 section-space" style={{ alignItems: 'center', marginTop: 66 }}>
        <div><div className="eyebrow">Built for the people doing the handoff</div><h2 style={{ font: '800 clamp(30px,4vw,44px)/1.08 var(--app-font-serif)', letterSpacing: '-.05em', maxWidth: 530 }}>Small details that make care easier to coordinate.</h2></div>
        <div style={{ display: 'grid', gap: 18 }}>{[{ icon: <Languages size={18} />, title: 'English and Tamil', copy: 'A familiar, bilingual work surface designed for quick reading.' }, { icon: <ShieldCheck size={18} />, title: 'Role-aware access', copy: 'Patient details stay within authorized staff and assigned facilities.' }, { icon: <Activity size={18} />, title: 'Fictional demo records', copy: 'Explore saved sample referrals without using real patient information.' }].map(item => <div className="feature-row" key={item.title}><div className="feature-icon">{item.icon}</div><div><strong>{item.title}</strong><div className="small-note" style={{ marginTop: 4 }}>{item.copy}</div></div></div>)}</div>
      </section>
      <section className="panel section-space" style={{ padding: '30px clamp(20px,5vw,46px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24, flexWrap: 'wrap', marginTop: 70, background: '#1c5551', color: '#f8f4e8', borderColor: '#1c5551' }}>
        <div><div style={{ color: '#e7a36c', textTransform: 'uppercase', letterSpacing: '.12em', fontSize: 11, fontWeight: 700 }}>A practical promise</div><h2 style={{ font: '700 clamp(23px,3vw,34px) var(--app-font-serif)', margin: '10px 0 0' }}>No referral left without a destination.</h2></div><Link className="btn" href="/sign-up" style={{ background: '#e7a36c', color: '#193b3b' }}>Get started<ArrowRight size={16} /></Link>
      </section>
      <footer className="footer" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}><span>NALAM AI · Care coordination for community health.</span><span>Use only for referral workflow. Not a clinical decision tool.</span></footer>
    </div>
  </main>;
}

function Sidebar({ role, location, mobile = false, onNavigate, language = 'en' }: { role: string; location: string; mobile?: boolean; onNavigate?: () => void; language?: Language }) {
  const items = navItems.filter(item => !item.admin || role === 'administrator');
  return <nav className={mobile ? 'mobile-nav' : undefined} aria-label="Main navigation">{!mobile && <div style={{ padding: '4px 9px 30px' }}><Brand inverse /></div>}
    {items.map(item => { const Icon = item.icon; return <Link key={item.href} href={item.href} onClick={onNavigate} className={`nav-link ${location === item.href ? 'active' : ''}`} data-testid={`link-nav-${item.href.slice(1)}`}><Icon size={18} /><span>{translate(item.label, language)}</span></Link>; })}
  </nav>;
}

function PortalShell() {
  const [location] = useLocation();
  const { user: clerkUser } = useUser();
  const { signOut } = useClerk();
  const me = useGetCurrentUser();
  const meData = me.data;
  const role = meData?.role ?? 'pending';
  const [language, setLanguage] = useState<Language>('en');
  if (me.isLoading) return <div className="app-shell"><aside className="sidebar"><Brand inverse /></aside><main className="main-area"><LoadingPanel count={5} /></main></div>;
  if (me.error) return <div style={{ padding: 28, maxWidth: 600, margin: '12vh auto' }}><Brand /><div className="panel error-state" style={{ marginTop: 25 }}><ShieldCheck size={27} /><h2 style={{ color: 'hsl(var(--foreground))' }}>We could not confirm your NALAM access</h2><p className="small-note">Your sign-in is active, but your work profile could not be loaded. No patient information is shown.</p><button className="btn" onClick={() => me.refetch()}>Try again</button></div></div>;
  const name = clerkUser?.fullName || clerkUser?.firstName || meData?.name || 'Team member';
  const restricted = role === 'pending';
  const currentNav = navItems.find(i => i.href === location);
  return <LanguageContext.Provider value={language}><div className="app-shell">
    <aside className="sidebar"><Sidebar role={role} location={location} language={language} />
      <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,.14)', padding: '19px 9px 8px' }}>
        <div style={{ fontSize: 12, fontWeight: 700 }}>{name}</div><div style={{ opacity: .6, fontSize: 10, marginTop: 3 }}>{clerkUser?.primaryEmailAddress?.emailAddress || meData?.email}</div><div style={{ opacity: .65, fontSize: 11, marginTop: 4, textTransform: 'capitalize' }}>{translate(roleText(role), language)}</div>
        <button onClick={() => signOut({ redirectUrl: basePath || '/' })} className="nav-link" style={{ width: '100%', border: 0, background: 'transparent', marginTop: 12, cursor: 'pointer' }} data-testid="button-sign-out"><LogOut size={17} />Sign out</button>
      </div>
    </aside>
    <main className="main-area">
      <div className="topbar" style={{ marginBottom: 25 }}>
        <div style={{ display: 'flex', gap: 13, alignItems: 'center' }}><div className="brand-mark" style={{ width: 32, height: 32 }}>N</div><div className="muted" style={{ fontSize: 13 }}><span style={{ color: 'hsl(var(--foreground))', fontWeight: 700 }}>{translate(currentNav?.label ?? 'NALAM workspace', language)}</span><span> / {role === 'administrator' ? 'Administration' : 'Care network'}</span></div></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><button className="btn secondary small" onClick={() => setLanguage(language === 'en' ? 'ta' : 'en')} data-testid="button-language"><Languages size={15} />{language === 'en' ? 'தமிழ்' : 'English'}</button><div style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', borderRadius: '50%', background: '#dfe9df', color: '#205a55', fontWeight: 700 }}>{name[0]?.toUpperCase()}</div><button title="Sign out" aria-label="Sign out" className="btn secondary small" onClick={() => signOut({ redirectUrl: basePath || '/' })} data-testid="button-sign-out-mobile"><LogOut size={15} /></button></div>
      </div>
      {restricted ? <div style={{ maxWidth: 760, margin: '7vh auto' }}><div className="panel" style={{ padding: 32 }}><div className="feature-icon"><ShieldCheck /></div><h1 className="page-title" style={{ marginTop: 22 }}>Your account is awaiting access</h1><p className="muted" style={{ lineHeight: 1.7, maxWidth: 560 }}>An administrator needs to assign your role and facility before you can view patient or referral information. Until then, sensitive records remain hidden.</p><div className="callout" style={{ marginTop: 22 }}>Signed in as <b>{clerkUser?.primaryEmailAddress?.emailAddress || meData?.email}</b>. Please contact your NALAM administrator.</div><button className="btn secondary" style={{ marginTop: 20 }} onClick={() => me.refetch()}>Check access again</button></div></div>
        : <Switch>
          <Route path="/dashboard" component={DashboardPage} />
          <Route path="/patients" component={PatientsPage} />
          <Route path="/referrals" component={ReferralsPage} />
          <Route path="/follow-ups" component={FollowupsPage} />
          <Route path="/facilities" component={FacilitiesPage} />
          <Route path="/reports" component={ReportsPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route path="/assistant" component={AssistantPage} />
          <Route component={NotFound} />
        </Switch>}
    </main>
    {!restricted && <Sidebar role={role} location={location} mobile language={language} />}
  </div></LanguageContext.Provider>;
}
function PortalGate() {
  return <><Show when="signed-in"><PortalShell /></Show><Show when="signed-out"><Redirect to="/" /></Show></>;
}

function DashboardPage() {
  const language = useContext(LanguageContext);
  const summary = useGetDashboardSummary();
  const data = summary.data;
  return <section><PageHeading title="A clear view of care in motion" description="Saved referral totals and the follow-ups that need attention." action={<Link className="btn" href="/referrals"><Plus size={16} />New referral</Link>} />
    <QueryState loading={summary.isLoading} error={summary.error} retry={() => summary.refetch()}>
      <div className="grid-3">
        {[{ label: 'All referrals', value: data?.total, icon: <HeartHandshake size={18} />, tint: '#e3eee7' }, { label: 'Needs attention', value: data?.pending, icon: <Clock3 size={18} />, tint: '#f4e5d5' }, { label: 'Overdue follow-ups', value: data?.overdueFollowups, icon: <CalendarClock size={18} />, tint: '#f5e3dc' }].map((m, i) => <article className="panel metric" key={m.label} data-testid={`metric-dashboard-${i}`}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>{translate(m.label, language)}</span><span style={{ width: 35, height: 35, display: 'grid', placeItems: 'center', borderRadius: 11, background: m.tint, color: '#2a625c' }}>{m.icon}</span></div><div className="metric-number">{m.value ?? '—'}</div></article>)}
      </div>
      <div className="grid-2 section-space">
        <article className="panel" style={{ padding: 22 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><div className="eyebrow">REFERRAL STATUS</div><h2 style={{ font: '700 20px var(--app-font-serif)', margin: '9px 0 0' }}>Where care stands</h2></div><Link href="/reports" className="muted" style={{ fontSize: 12, textDecoration: 'none' }}>Details <ArrowRight size={13} /></Link></div>
          <div style={{ display: 'grid', gap: 17, marginTop: 25 }}>{[{ label: 'In progress', value: data?.inProgress, color: '#4d8290' }, { label: 'Completed', value: data?.completed, color: '#3b8275' }, { label: 'Pending', value: data?.pending, color: '#de9d63' }].map(row => { const pct = data?.total ? Math.round((Number(row.value || 0) / data.total) * 100) : 0; return <div key={row.label}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}><span>{row.label}</span><b>{row.value ?? '—'} <span className="muted" style={{ fontWeight: 400 }}>({pct}%)</span></b></div><div className="bar-track"><div className="bar-fill" style={{ width: `${pct}%`, background: row.color }} /></div></div>; })}</div>
        </article>
        <article className="panel" style={{ padding: 22, background: '#1c5551', color: '#f8f4e8', borderColor: '#1c5551' }}><div className="eyebrow" style={{ color: '#efb17a' }}>YOUR NEXT STEP</div><h2 style={{ font: '700 24px/1.12 var(--app-font-serif)', maxWidth: 300, margin: '13px 0' }}>Every handoff needs an accountable destination.</h2><p style={{ opacity: .77, fontSize: 13, lineHeight: 1.6 }}>Start a referral, or review follow-ups that have moved past their scheduled date.</p><div style={{ display: 'flex', gap: 9, marginTop: 22, flexWrap: 'wrap' }}><Link className="btn" href="/referrals" style={{ background: '#e8a66e', color: '#173b3b' }}>Create referral<ArrowRight size={15} /></Link><Link className="btn secondary small" href="/follow-ups">Review follow-ups</Link></div></article>
      </div>
      <article className="panel section-space" style={{ padding: 22 }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}><div><div className="eyebrow">DESTINATIONS</div><h2 style={{ font: '700 20px var(--app-font-serif)', margin: '7px 0 0' }}>Referral activity by facility</h2></div><Building2 size={20} className="muted" /></div>
        {!data?.facilities?.length ? <div className="empty-state">No facility totals are available yet.</div> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Facility</th><th>Total</th><th>Pending</th><th>In progress</th><th>Completed</th></tr></thead><tbody>{data.facilities.map(f => <tr key={f.facilityId}><td style={{ fontWeight: 700 }}>{f.facilityName}</td><td>{f.total}</td><td>{f.pending}</td><td>{f.inProgress}</td><td>{f.completed}</td></tr>)}</tbody></table></div>}
      </article>
    </QueryState>
  </section>;
}

function PatientsPage() {
  const [search, setSearch] = useState('');
  const params = search.trim() ? { search: search.trim() } : undefined;
  const patients = useListPatients(params, { query: { queryKey: getListPatientsQueryKey(params) } });
  return <section><PageHeading title="Patients" description="Find saved patient records available to your account." />
    <div className="callout"><LockKeyhole size={15} style={{ verticalAlign: 'middle', marginRight: 7 }} />Demo patient records are fictional only. Never add real patient details in this preview. In a live service, keep patient information private and access it only for care coordination.</div>
    <div className="toolbar"><div style={{ position: 'relative', flex: '1 1 280px', maxWidth: 460 }}><Search size={17} style={{ position: 'absolute', left: 12, top: 13, color: '#74837d' }} /><input className="search-box" style={{ paddingLeft: 38 }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or patient ID" aria-label="Search patients" data-testid="input-search-patients" /></div><span className="small-note">Results come from saved records only.</span></div>
    <QueryState loading={patients.isLoading} error={patients.error} retry={() => patients.refetch()} empty={!patients.data?.length} emptyTitle={search ? 'No matching patients' : 'No patient records'}>
      <div className="panel table-wrap"><table className="data-table"><thead><tr><th>Patient</th><th>Patient ID</th><th>Age</th><th>Contact</th><th>Added</th></tr></thead><tbody>{patients.data?.map(p => <tr key={p.patientId} data-testid={`row-patient-${p.patientId}`}><td style={{ fontWeight: 700 }}>{p.name}</td><td>{p.patientId}</td><td>{p.age}</td><td>{p.contactNumber}</td><td>{displayDate(p.createdAt)}</td></tr>)}</tbody></table></div>
    </QueryState>
  </section>;
}

function ReferralsPage() {
  const language = useContext(LanguageContext);
  const qc = useQueryClient();
  const me = useGetCurrentUser();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [facilityId, setFacilityId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showForm, setShowForm] = useState(false);
  const params = {
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(status ? { status: status as 'pending' | 'in_progress' | 'completed' } : {}),
    ...(facilityId ? { facilityId: Number(facilityId) } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
  };
  const referrals = useListReferrals(params, { query: { queryKey: getListReferralsQueryKey(params) } });
  const facilities = useListFacilities();
  const create = useCreateReferral();
  const updateStatus = useUpdateReferralStatus();
  const canCreate = me.data?.role === 'health_worker' || me.data?.role === 'administrator';
  const canUpdate = (referral: { facilityId: number }) => me.data?.role === 'administrator' || (me.data?.role === 'facility_staff' && me.data.facilityId === referral.facilityId);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const fd = new FormData(e.currentTarget);
    create.mutate({ data: { patientId: String(fd.get('patientId')).trim(), patientName: String(fd.get('patientName')).trim(), age: Number(fd.get('age')), contactNumber: String(fd.get('contactNumber')).trim(), facilityId: Number(fd.get('facilityId')), referralDate: String(fd.get('referralDate')), reason: String(fd.get('reason')).trim() } }, {
      onSuccess: () => { setShowForm(false); e.currentTarget?.reset?.(); void qc.invalidateQueries({ queryKey: getListReferralsQueryKey() }); void qc.invalidateQueries({ queryKey: getListPatientsQueryKey() }); void qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); },
    });
  };
  return <section><PageHeading title="Referrals" description="Search referral records and keep each destination accountable." action={canCreate ? <button className="btn" onClick={() => setShowForm(!showForm)} data-testid="button-new-referral"><Plus size={16} />{translate('New referral', language)}</button> : undefined} />
    {!canCreate && <div className="small-note">Your role can review referral information. Health workers create referrals; facility staff can update records assigned to their facility.</div>}
     {showForm && canCreate && <form className="panel" onSubmit={submit} style={{ padding: 22, marginBottom: 18 }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 17 }}><div><div className="eyebrow">NEW HANDOFF</div><h2 style={{ font: '700 21px var(--app-font-serif)', margin: '6px 0' }}>{translate('Create a referral', language)}</h2></div><button type="button" className="btn secondary small" onClick={() => setShowForm(false)} aria-label="Close referral form"><X size={15} /></button></div>
       <div className="form-grid"><label className="field">{translate('Patient ID', language)}<input name="patientId" required maxLength={32} /></label><label className="field">{translate('Patient name', language)}<input name="patientName" required maxLength={140} /></label><label className="field">{translate('Age', language)}<input name="age" type="number" min="0" max="120" required /></label><label className="field">{translate('Contact number', language)}<input name="contactNumber" type="tel" minLength={7} maxLength={18} required /></label><label className="field">{translate('Referral destination', language)}<select name="facilityId" required defaultValue=""><option value="" disabled>{translate('Select facility', language)}</option>{facilities.data?.filter(f => f.active).map(f => <option key={f.id} value={f.id}>{f.name} · {f.kind}</option>)}</select></label><label className="field">{translate('Referral date', language)}<input name="referralDate" type="date" defaultValue={dateToday()} required /></label><label className="field wide">{translate('Reason for referral', language)}<textarea name="reason" required minLength={2} maxLength={1000} placeholder="Briefly note the reason for this referral" /></label></div>
      <FormNotice error={create.error} success={create.isSuccess ? 'Referral saved.' : undefined} /><div style={{ marginTop: 17, display: 'flex', justifyContent: 'flex-end' }}><button className="btn" disabled={create.isPending} data-testid="button-submit-referral">{create.isPending ? 'Saving…' : 'Save referral'}</button></div>
    </form>}
    <div className="toolbar" style={{ alignItems: 'end' }}>
      <div style={{ position: 'relative', flex: '1 1 230px', maxWidth: 360 }}><Search size={16} style={{ position: 'absolute', left: 12, top: 13, color: '#74837d' }} /><input className="search-box" style={{ paddingLeft: 37 }} value={search} onChange={e => setSearch(e.target.value)} placeholder={translate('Search patient or destination', language)} aria-label="Search referrals" data-testid="input-search-referrals" /></div>
      <select className="search-box" style={{ width: 160, flex: '1 1 145px' }} value={status} onChange={e => setStatus(e.target.value)} aria-label="Filter referrals by status" data-testid="select-referral-status"><option value="">{translate('All statuses', language)}</option><option value="pending">{translate('Pending', language)}</option><option value="in_progress">{translate('In progress', language)}</option><option value="completed">{translate('Completed', language)}</option></select>
      <select className="search-box" style={{ width: 210, flex: '1 1 190px' }} value={facilityId} onChange={e => setFacilityId(e.target.value)} aria-label="Filter referrals by facility" data-testid="select-referral-facility"><option value="">{translate('All facilities', language)}</option>{facilities.data?.filter(f => f.active).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
      <label className="field" style={{ flex: '1 1 145px', maxWidth: 180, fontSize: 12 }}>{translate('From', language)}<input className="search-box" type="date" value={dateFrom} max={dateTo || undefined} onChange={e => setDateFrom(e.target.value)} aria-label="Filter referrals from date" data-testid="input-referral-date-from" /></label>
      <label className="field" style={{ flex: '1 1 145px', maxWidth: 180, fontSize: 12 }}>{translate('To', language)}<input className="search-box" type="date" value={dateTo} min={dateFrom || undefined} onChange={e => setDateTo(e.target.value)} aria-label="Filter referrals to date" data-testid="input-referral-date-to" /></label>
      {(search || status || facilityId || dateFrom || dateTo) && <button type="button" className="btn secondary small" onClick={() => { setSearch(''); setStatus(''); setFacilityId(''); setDateFrom(''); setDateTo(''); }} data-testid="button-clear-referral-filters">{translate('Clear filters', language)}</button>}
    </div>
    <FormNotice error={updateStatus.error} />
     <QueryState loading={referrals.isLoading} error={referrals.error} retry={() => referrals.refetch()} empty={!referrals.data?.length} emptyTitle="No referrals found"><div className="panel table-wrap"><table className="data-table"><thead><tr><th>{translate('Patient', language)}</th><th>{translate('Destination', language)}</th><th>{translate('Referral date', language)}</th><th>{translate('Reason', language)}</th><th>{translate('Status', language)}</th><th>{translate('Next action', language)}</th></tr></thead><tbody>{referrals.data?.map(r => <tr key={r.id}><td><strong>{r.patientName}</strong><div className="small-note">{r.patientId} · age {r.patientAge}</div></td><td>{r.facilityName}</td><td>{displayDate(r.referralDate)}</td><td style={{ maxWidth: 220 }}>{r.reason}</td><td><span className={`status-pill ${r.status}`}>{translate(roleText(r.status), language)}</span></td><td>{canUpdate(r) && r.status !== 'completed' ? <button className="btn secondary small" disabled={updateStatus.isPending} onClick={() => updateStatus.mutate({ id: r.id, data: { status: r.status === 'pending' ? 'in_progress' : 'completed' } }, { onSuccess: () => { void qc.invalidateQueries({ queryKey: getListReferralsQueryKey() }); void qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); } })}>{r.status === 'pending' ? translate('Mark in progress', language) : translate('Complete', language)}</button> : <span className="muted" style={{ fontSize: 12 }}>—</span>}</td></tr>)}</tbody></table></div></QueryState>
  </section>;
}

function FollowupsPage() {
  const language = useContext(LanguageContext);
  const qc = useQueryClient();
  const me = useGetCurrentUser();
  const [state, setState] = useState<'all'|'upcoming'|'overdue'|'completed'>('all');
  const [showForm, setShowForm] = useState(false);
  const params = { state };
  const followups = useListFollowups(params, { query: { queryKey: getListFollowupsQueryKey(params) } });
  const facilities = useListFacilities();
  const create = useCreateFollowup();
  const update = useUpdateFollowup();
  const canCreate = me.data?.role === 'health_worker' || me.data?.role === 'administrator' || me.data?.role === 'facility_staff';
  const availableFacilities = facilities.data?.filter(f => f.active && (me.data?.role !== 'facility_staff' || f.id === me.data.facilityId));
  const canUpdate = me.data?.role === 'administrator' || me.data?.role === 'health_worker' || (me.data?.role === 'facility_staff' && me.data.facilityId != null);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const fd = new FormData(e.currentTarget);
    const referralId = String(fd.get('referralId') || '').trim();
    create.mutate({ data: { patientId: String(fd.get('patientId')).trim(), referralId: referralId ? Number(referralId) : null, facilityId: Number(fd.get('facilityId')), followUpDate: String(fd.get('followUpDate')), notes: String(fd.get('notes') || '').trim() } }, {
      onSuccess: () => { setShowForm(false); e.currentTarget?.reset?.(); void qc.invalidateQueries({ queryKey: getListFollowupsQueryKey() }); void qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); },
    });
  };
  return <section><PageHeading title="Follow-ups" description="See upcoming visits, overdue actions and completed follow-ups." action={canCreate ? <button className="btn" onClick={() => setShowForm(!showForm)} data-testid="button-schedule-followup"><Plus size={16} />{translate('Schedule follow-up', language)}</button> : undefined} />
    {showForm && canCreate && <form className="panel" onSubmit={submit} style={{ padding: 22, marginBottom: 18 }}><div className="eyebrow">SCHEDULE A NEXT STEP</div><h2 style={{ font: '700 21px var(--app-font-serif)', margin: '7px 0 18px' }}>New follow-up</h2><div className="form-grid"><label className="field">{translate('Patient ID', language)}<input name="patientId" required maxLength={32} /></label><label className="field">{translate('Referral ID', language)} <span className="muted" style={{ fontWeight: 400 }}>(optional)</span><input name="referralId" type="number" min="1" /></label><label className="field">{translate('Facility', language)}<select name="facilityId" required defaultValue={me.data?.role === 'facility_staff' ? String(me.data.facilityId ?? '') : ''}><option value="" disabled>{translate('Select facility', language)}</option>{availableFacilities?.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label><label className="field">{translate('Visit date', language)}<input name="followUpDate" type="date" defaultValue={dateToday()} required /></label><label className="field wide">{translate('Notes', language)}<textarea name="notes" maxLength={1000} placeholder="Coordination notes (do not include unnecessary sensitive details)" /></label></div><FormNotice error={create.error} /><div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}><button className="btn" disabled={create.isPending} data-testid="button-save-followup">{create.isPending ? 'Saving…' : translate('Save follow-up', language)}</button></div></form>}
    <div className="toolbar" role="group" aria-label="Filter follow-ups">{(['all','upcoming','overdue','completed'] as const).map(item => <button key={item} className={`btn ${state === item ? '' : 'secondary'} small`} onClick={() => setState(item)} style={{ textTransform: 'capitalize' }} data-testid={`button-filter-${item}`}>{translate(item === 'all' ? 'All visits' : item, language)}</button>)}</div><FormNotice error={update.error} />
    <QueryState loading={followups.isLoading} error={followups.error} retry={() => followups.refetch()} empty={!followups.data?.length} emptyTitle="No follow-ups in this view"><div className="panel table-wrap"><table className="data-table"><thead><tr><th>{translate('Patient', language)}</th><th>{translate('Scheduled date', language)}</th><th>{translate('Facility', language)}</th><th>{translate('Notes', language)}</th><th>{translate('State', language)}</th><th>{translate('Action', language)}</th></tr></thead><tbody>{followups.data?.map(f => <tr key={f.id}><td style={{ fontWeight: 700 }}>{f.patientName}<div className="small-note">{f.patientId}</div></td><td>{displayDate(f.followUpDate)}</td><td>{f.facilityName}</td><td>{f.notes || '—'}</td><td><span className={`status-pill ${f.overdue && f.status !== 'completed' ? 'overdue' : f.status}`}>{translate(f.overdue && f.status !== 'completed' ? 'overdue' : f.status, language)}</span></td><td>{canUpdate && f.status !== 'completed' ? <button className="btn secondary small" disabled={update.isPending || (me.data?.role === 'facility_staff' && me.data.facilityId !== f.facilityId)} onClick={() => update.mutate({ id: f.id, data: { status: 'completed' } }, { onSuccess: () => { void qc.invalidateQueries({ queryKey: getListFollowupsQueryKey() }); void qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); } })}><Check size={14} />{translate('Mark done', language)}</button> : '—'}</td></tr>)}</tbody></table></div></QueryState>
  </section>;
}

function FacilitiesPage() {
  const language = useContext(LanguageContext);
  const qc = useQueryClient();
  const me = useGetCurrentUser();
  const facilities = useListFacilities();
  const create = useCreateFacility();
  const update = useUpdateFacility();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [kind, setKind] = useState<'PHC'|'Hospital'>('PHC');
  const admin = me.data?.role === 'administrator';
  const showForm = (facility?: any) => { setEdit(facility || null); setKind(facility?.kind || 'PHC'); setOpen(true); };
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const fd = new FormData(e.currentTarget);
    const payload = { name: String(fd.get('name')).trim(), kind, district: String(fd.get('district')).trim(), address: String(fd.get('address')).trim(), contactNumber: String(fd.get('contactNumber')).trim() };
    const onSuccess = () => { setOpen(false); void qc.invalidateQueries({ queryKey: getListFacilitiesQueryKey() }); void qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); };
    if (edit) update.mutate({ id: edit.id, data: payload }, { onSuccess });
    else create.mutate({ data: payload }, { onSuccess });
  };
  const toggleActive = (f: any) => update.mutate({ id: f.id, data: { active: !f.active } }, { onSuccess: () => { void qc.invalidateQueries({ queryKey: getListFacilitiesQueryKey() }); void qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); } });
  return <section><PageHeading title="Facilities" description="PHCs and hospitals available as referral destinations." action={admin ? <button className="btn" onClick={() => showForm()}><Plus size={16} />Add facility</button> : undefined} />
    {open && admin && <form className="panel" onSubmit={submit} style={{ padding: 22, marginBottom: 20 }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><div><div className="eyebrow">{edit ? 'EDIT DESTINATION' : 'NEW DESTINATION'}</div><h2 style={{ font: '700 21px var(--app-font-serif)', margin: '7px 0 17px' }}>{edit ? 'Update facility' : 'Add a facility'}</h2></div><button className="btn secondary small" type="button" onClick={() => setOpen(false)} aria-label="Close form"><X size={15} /></button></div><div className="form-grid"><label className="field">Facility name<input name="name" required minLength={2} defaultValue={edit?.name || ''} /></label><label className="field">Type<select value={kind} onChange={e => setKind(e.target.value as 'PHC'|'Hospital')}><option value="PHC">PHC</option><option value="Hospital">Hospital</option></select></label><label className="field">District<input name="district" defaultValue={edit?.district || ''} /></label><label className="field">Contact number<input name="contactNumber" type="tel" defaultValue={edit?.contactNumber || ''} /></label><label className="field wide">Address<textarea name="address" defaultValue={edit?.address || ''} /></label></div><FormNotice error={edit ? update.error : create.error} /><div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 15 }}><button className="btn" disabled={create.isPending || update.isPending}>{edit ? 'Save changes' : 'Save facility'}</button></div></form>}
    {!admin && <div className="small-note">Facility records are managed by administrators. Contact an administrator if a destination needs correction.</div>}
    <QueryState loading={facilities.isLoading} error={facilities.error} retry={() => facilities.refetch()} empty={!facilities.data?.length} emptyTitle="No facilities have been saved"><div className="grid-2">{facilities.data?.map(f => <article className="panel" key={f.id} style={{ padding: 21 }}><div style={{ display: 'flex', gap: 13 }}><div className="feature-icon">{f.kind === 'Hospital' ? <Hospital size={19} /> : <Building2 size={19} />}</div><div style={{ flex: 1 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'start' }}><div><h2 style={{ font: '700 19px var(--app-font-serif)', margin: 0 }}>{f.name}</h2><div className="small-note" style={{ marginTop: 5 }}>{f.kind} · {f.district}</div></div><span className={`status-pill ${f.active ? 'completed' : 'pending'}`}>{translate(f.active ? 'Active' : 'Inactive', language)}</span></div><p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>{f.address || 'Address not provided'}<br />{f.contactNumber || 'Contact not provided'}</p>{admin && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="btn secondary small" onClick={() => showForm(f)}>Edit details</button><button className="btn secondary small" disabled={update.isPending} onClick={() => toggleActive(f)}>{f.active ? 'Deactivate' : 'Activate'}</button></div>}</div></div></article>)}</div></QueryState>
    <FormNotice error={update.error} />
  </section>;
}

function ReportsPage() {
  const summary = useGetDashboardSummary();
  return <section><PageHeading title="Reports" description="Facility-level referral activity, based on saved records." />
    <div className="callout"><ShieldCheck size={15} style={{ verticalAlign: 'middle', marginRight: 7 }} />This view contains aggregate counts only. Reports reflect records saved in NALAM; no sample or estimated data is shown.</div>
    <QueryState loading={summary.isLoading} error={summary.error} retry={() => summary.refetch()}>
      <div className="grid-3 section-space">{[{ label: 'Total referrals', val: summary.data?.total, icon: <HeartHandshake size={18} /> }, { label: 'Completed', val: summary.data?.completed, icon: <CheckCircle2 size={18} /> }, { label: 'Overdue follow-ups', val: summary.data?.overdueFollowups, icon: <CalendarClock size={18} /> }].map(x => <article className="panel metric" key={x.label}><div className="feature-row"><div className="feature-icon">{x.icon}</div><span className="muted" style={{ fontSize: 13, alignSelf: 'center' }}>{x.label}</span></div><div className="metric-number">{x.val ?? '—'}</div></article>)}</div>
      <article className="panel section-space" style={{ padding: 22 }}><div className="eyebrow">FACILITY DETAIL</div><h2 style={{ font: '700 22px var(--app-font-serif)', margin: '8px 0 20px' }}>Referral completion by destination</h2>
        {!summary.data?.facilities?.length ? <div className="empty-state">No saved facility analytics are available yet.</div> : <div style={{ display: 'grid', gap: 20 }}>{summary.data.facilities.map(f => { const pct = f.total ? Math.round(f.completed / f.total * 100) : 0; return <div key={f.facilityId}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 9 }}><div><strong>{f.facilityName}</strong><div className="small-note">{f.total} referrals · {f.pending} pending · {f.inProgress} in progress · {f.completed} completed</div></div><b>{pct}%</b></div><div className="bar-track" style={{ height: 10 }}><div className="bar-fill" style={{ width: `${pct}%` }} /></div></div>; })}</div>}
      </article>
    </QueryState>
  </section>;
}

function SettingsPage() {
  const qc = useQueryClient();
  const me = useGetCurrentUser();
  const users = useListUsers({ query: { enabled: me.data?.role === 'administrator', queryKey: getListUsersQueryKey() } });
  const facilities = useListFacilities();
  const update = useUpdateUserRole();
  if (me.data?.role !== 'administrator') return <section><PageHeading title="Team access" description="User roles and facility assignments." /><div className="panel empty-state"><ShieldCheck size={25} style={{ margin: '0 auto 12px' }} /><strong>Administrator access required</strong><p className="small-note">Only administrators can assign roles and facilities.</p></div></section>;
  return <section><PageHeading title="Team access" description="Assign each colleague a role and, when needed, a facility." />
    <div className="callout"><LockKeyhole size={15} style={{ verticalAlign: 'middle', marginRight: 7 }} />Pending accounts cannot access patient data. Assign the least access needed for each role.</div><FormNotice error={update.error} />
    <QueryState loading={users.isLoading || facilities.isLoading} error={users.error || facilities.error} retry={() => { void users.refetch(); void facilities.refetch(); }} empty={!users.data?.length} emptyTitle="No users found">
      <div className="panel table-wrap section-space"><table className="data-table"><thead><tr><th>Team member</th><th>Current role</th><th>Facility</th><th>Change access</th></tr></thead><tbody>{users.data?.map(u => <tr key={u.id}><td><strong>{u.name}</strong><div className="small-note">{u.email}</div></td><td style={{ textTransform: 'capitalize' }}>{roleText(u.role)}</td><td>{u.facilityName || 'Not assigned'}</td><td><form style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }} onSubmit={e => { e.preventDefault(); const fd = new FormData(e.currentTarget); const role = String(fd.get('role')) as 'administrator'|'health_worker'|'facility_staff'|'pending'; const raw = String(fd.get('facilityId') || ''); update.mutate({ id: u.id, data: { role, facilityId: raw ? Number(raw) : null } }, { onSuccess: () => { void qc.invalidateQueries({ queryKey: getListUsersQueryKey() }); void qc.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() }); } }); }}><select name="role" defaultValue={u.role} aria-label={`Role for ${u.name}`} className="search-box" style={{ width: 145, padding: '8px 9px' }}><option value="pending">Pending</option><option value="health_worker">Health worker</option><option value="facility_staff">Facility staff</option><option value="administrator">Administrator</option></select><select name="facilityId" defaultValue={u.facilityId ?? ''} aria-label={`Facility for ${u.name}`} className="search-box" style={{ width: 160, padding: '8px 9px' }}><option value="">No facility</option>{facilities.data?.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select><button className="btn secondary small" disabled={update.isPending}>Save</button></form></td></tr>)}</tbody></table></div>
    </QueryState>
  </section>;
}

function AssistantPage() {
  const reply = useGetAssistantReply();
  const [question, setQuestion] = useState('');
  const [language, setLanguage] = useState<'en'|'ta'>('en');
  const [conversation, setConversation] = useState<{question:string;answer?:string;error?:boolean}[]>([]);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const text = question.trim(); if (!text || reply.isPending) return;
    setConversation(old => [...old, { question: text }]); setQuestion('');
    reply.mutate({ data: { question: text, language } }, {
      onSuccess: result => setConversation(old => old.map((entry, index) => index === old.length - 1 ? { ...entry, answer: result.answer } : entry)),
      onError: () => setConversation(old => old.map((entry, index) => index === old.length - 1 ? { ...entry, answer: 'The help assistant could not respond. Please try again.', error: true } : entry)),
    });
  };
  return <section><PageHeading title="NALAM help assistant" description="Ask about using the platform and referral workflow." />
    <div className="callout" style={{ borderColor: '#b84e46', background: '#f8e9e4', color: '#623d36' }}><strong>Platform help only — not medical advice.</strong><br />This assistant sends the question text to OpenAI using your organization’s own key/account. The question is not stored in the NALAM app. Chat history and patient records are never sent. Do not include names, IDs, referral reasons, contact details or other private information. Verified-source general health answers are not implemented.</div>
    <div className="panel section-space" style={{ padding: '22px clamp(16px,4vw,30px)', minHeight: 350, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 17, borderBottom: '1px solid hsl(var(--border))' }}><div className="feature-icon"><MessageSquareText size={19} /></div><div><strong>NALAM workflow support</strong><div className="small-note">Your question is sent on its own, without chat history or patient records.</div></div><select className="search-box" value={language} onChange={e => setLanguage(e.target.value as 'en'|'ta')} aria-label="Assistant language" style={{ width: 112, marginLeft: 'auto' }}><option value="en">English</option><option value="ta">தமிழ்</option></select></div>
      <div aria-live="polite" style={{ display: 'grid', gap: 13, padding: '18px 0', flex: 1 }}>
        {!conversation.length && <div className="empty-state" style={{ padding: '27px 10px' }}><CircleHelp size={27} style={{ color: 'hsl(var(--primary))', marginBottom: 12 }} /><div style={{ color: 'hsl(var(--foreground))', fontWeight: 700 }}>What would you like help with?</div><p className="small-note">For example: “How do I update a referral status?”</p></div>}
        {conversation.map((entry, i) => <div key={`${i}-${entry.question}`}><div className="message user">{entry.question}</div>{entry.answer && <div className="message assistant" style={{ marginTop: 11 }}><div style={{ color: '#286a63', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 7 }}>AI-generated answer</div>{entry.answer}{entry.error && <button className="btn secondary small" style={{ display: 'flex', marginTop: 10 }} onClick={() => { setQuestion(entry.question); }}>Try this question again</button>}</div>}</div>)}
        {reply.isPending && <div className="message assistant"><div className="skeleton" style={{ width: '70%' }} /><div className="skeleton" style={{ width: '49%', marginTop: 9 }} /></div>}
      </div>
      <form onSubmit={submit} style={{ display: 'flex', gap: 9, borderTop: '1px solid hsl(var(--border))', paddingTop: 16 }}><label className="field" style={{ flex: 1 }}><span className="sr-only">Your platform question</span><input value={question} onChange={e => setQuestion(e.target.value)} maxLength={2000} required placeholder="Ask a platform or referral-workflow question…" data-testid="input-assistant-question" /></label><button className="btn" disabled={reply.isPending || !question.trim()} data-testid="button-send-assistant">{reply.isPending ? 'Sending…' : 'Send'}<ArrowRight size={15} /></button></form>
    </div>
  </section>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
function HomeRedirect() {
  return <><Show when="signed-in"><Redirect to="/dashboard" /></Show><Show when="signed-out"><Home /></Show></>;
}
function SignInPage() {
  return <main className="public-wrap" style={{ minHeight: '100dvh', display: 'grid', alignContent: 'center' }}><Link href="/" style={{ textDecoration: 'none', margin: '0 auto 22px' }}><Brand /></Link><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></main>;
}
function SignUpPage() {
  return <main className="public-wrap" style={{ minHeight: '100dvh', display: 'grid', alignContent: 'center' }}><Link href="/" style={{ textDecoration: 'none', margin: '0 auto 22px' }}><Brand /></Link><div className="panel" style={{ maxWidth: 440, margin: '0 auto 18px', padding: '16px 19px' }}><div className="eyebrow">ORGANIZATION SETUP</div><strong style={{ display: 'block', marginTop: 7 }}>Register the organization owner first.</strong><p className="small-note" style={{ marginBottom: 0 }}>The first authenticated account becomes the initial administrator. Every later account starts pending until an administrator assigns a role and facility.</p></div><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></main>;
}
function ClerkCacheInvalidator() {
  const { addListener } = useClerk();
  const cache = useQueryClient();
  useEffect(() => {
    let previous: string | null | undefined;
    const unsubscribe = addListener(({ user }) => { const id = user?.id ?? null; if (previous !== undefined && previous !== id) cache.clear(); previous = id; });
    return unsubscribe;
  }, [addListener, cache]);
  return null;
}
function ClerkRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={appearance}
    signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}
    localization={{ signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to your NALAM workspace' } }, signUp: { start: { title: 'Join your care team', subtitle: 'Create your NALAM account' } } }}
    routerPush={to => setLocation(stripBase(to))} routerReplace={to => setLocation(stripBase(to), { replace: true })}>
    <QueryClientProvider client={queryClient}><ClerkCacheInvalidator />
      <RoutedErrorBoundary><Switch>
        <Route path="/" component={HomeRedirect} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route path="/dashboard" component={PortalGate} />
        <Route path="/patients" component={PortalGate} />
        <Route path="/referrals" component={PortalGate} />
        <Route path="/follow-ups" component={PortalGate} />
        <Route path="/facilities" component={PortalGate} />
        <Route path="/reports" component={PortalGate} />
        <Route path="/settings" component={PortalGate} />
        <Route path="/assistant" component={PortalGate} />
        <Route component={NotFound} />
      </Switch></RoutedErrorBoundary>
    </QueryClientProvider>
  </ClerkProvider>;
}
function App() {
  return <TooltipProvider><WouterRouter base={basePath}><ClerkRoutes /></WouterRouter><Toaster /></TooltipProvider>;
}
export default App;

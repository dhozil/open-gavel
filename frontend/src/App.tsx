import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { Gavel } from "lucide-react";
import { AccountProvider } from "./lib/account";
import { SiteHeader } from "./components/SiteHeader";
import { Landing } from "./pages/Landing";
import { Communities } from "./pages/Communities";
import { HowItWorks } from "./pages/HowItWorks";
import { Report } from "./pages/Report";
import { CaseDetail } from "./pages/CaseDetail";
import { Admin } from "./pages/Admin";
import cityStreet from "./assets/city-street.jpg";

/**
 * Shared city backdrop: the same street photo as the hero, fixed behind
 * every page with a heavy parchment veil so text stays readable. The hero
 * covers it fully with its own composition; content pages let it glow through.
 */
function CityBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0">
      <img
        src={cityStreet}
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-bottom"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-parchment via-parchment/85 to-parchment/70" />
    </div>
  );
}

function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <p className="font-display text-5xl">404</p>
      <p className="mt-2 text-sm opacity-70">No such record in this court.</p>
      <Link to="/" className="mt-4 inline-block font-bold underline">
        Back to overview
      </Link>
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-court/15">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-6 text-xs opacity-70">
        <span className="inline-flex items-center gap-1 font-bold">
          <Gavel size={12} /> OpenGavel
        </span>
        <span>Fair and transparent moderation · StudioNet · contract 0x4708b9Ace6EE163cD2bF77bcDed5f81F33ACA3B6</span>
      </div>
    </footer>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AccountProvider>
        <div className="min-h-svh bg-parchment text-court">
          <CityBackdrop />
          <div className="relative z-10">
          <SiteHeader />
          <main>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/communities" element={<Communities />} />
              <Route path="/how-it-works" element={<HowItWorks />} />
              <Route path="/report" element={<Report />} />
              <Route path="/case/:id" element={<CaseDetail />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
          <Footer />
          </div>
        </div>
      </AccountProvider>
    </BrowserRouter>
  );
}

export default App;

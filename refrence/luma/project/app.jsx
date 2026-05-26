// Luma redesign — assembled in a design canvas

function PhoneFrame({ children, theme = 'dark' }) {
  return (
    <div className="phone-frame" data-theme={theme}>
      <div className="phone-notch"/>
      <div className="phone-screen">
        {children}
      </div>
    </div>
  );
}

function BrowserFrame({ children, url = 'luma.local/today', theme = 'dark' }) {
  return (
    <div className="window-frame" data-theme={theme} style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="window-chrome">
        <div className="window-dot red"/>
        <div className="window-dot yellow"/>
        <div className="window-dot green"/>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <div className="window-url" style={{
            padding: '4px 14px',
            borderRadius: 6,
            fontSize: 11, color: 'var(--fg-quiet)',
            fontFamily: 'var(--font-mono)',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <Icon name="lock" size={9}/> {url}
          </div>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {children}
      </div>
    </div>
  );
}

function LumaCanvas() {
  return (
    <DesignCanvas
      title="Luma · Glassy Atmospheric"
      subtitle="Out of the dark ages — a luminous, inspirational redesign · dark by default, sunrise-warm light mode to complement"
    >
      {/* ──── 1. SIGN IN ──── */}
      <DCSection id="signin" title="01 — Sign in" subtitle="Dark · default — Light · sunrise warm">
        <DCArtboard id="signin-desktop" label="Desktop · dark" width={1280} height={838}>
          <BrowserFrame url="luma.local/sign-in"><SignInDesktop/></BrowserFrame>
        </DCArtboard>
        <DCArtboard id="signin-desktop-light" label="Desktop · light" width={1280} height={838}>
          <BrowserFrame url="luma.local/sign-in" theme="light"><SignInDesktop/></BrowserFrame>
        </DCArtboard>
        <DCArtboard id="signin-mobile" label="Mobile · dark" width={414} height={868}>
          <PhoneFrame><SignInMobile/></PhoneFrame>
        </DCArtboard>
        <DCArtboard id="signin-mobile-light" label="Mobile · light" width={414} height={868}>
          <PhoneFrame theme="light"><SignInMobile/></PhoneFrame>
        </DCArtboard>
      </DCSection>

      {/* ──── 2. TODAY ──── */}
      <DCSection id="today" title="02 — Today · the hero" subtitle="Rings · streak · weight curve · gentle nudges">
        <DCArtboard id="today-desktop" label="Desktop · dark" width={1280} height={1100}>
          <BrowserFrame url="luma.local/today"><TodayDesktop/></BrowserFrame>
        </DCArtboard>
        <DCArtboard id="today-desktop-light" label="Desktop · light" width={1280} height={1100}>
          <BrowserFrame url="luma.local/today" theme="light"><TodayDesktop/></BrowserFrame>
        </DCArtboard>
        <DCArtboard id="today-mobile" label="Mobile · dark" width={414} height={868}>
          <PhoneFrame><TodayMobile/></PhoneFrame>
        </DCArtboard>
        <DCArtboard id="today-mobile-light" label="Mobile · light" width={414} height={868}>
          <PhoneFrame theme="light"><TodayMobile/></PhoneFrame>
        </DCArtboard>
      </DCSection>

      {/* ──── 3. PLAN ──── */}
      <DCSection id="plan" title="03 — Weekly plan">
        <DCArtboard id="plan-desktop" label="Desktop · dark" width={1280} height={1100}>
          <BrowserFrame url="luma.local/plan"><PlanDesktop/></BrowserFrame>
        </DCArtboard>
        <DCArtboard id="plan-desktop-light" label="Desktop · light" width={1280} height={1100}>
          <BrowserFrame url="luma.local/plan" theme="light"><PlanDesktop/></BrowserFrame>
        </DCArtboard>
        <DCArtboard id="plan-mobile" label="Mobile · dark" width={414} height={868}>
          <PhoneFrame><PlanMobile/></PhoneFrame>
        </DCArtboard>
        <DCArtboard id="plan-mobile-light" label="Mobile · light" width={414} height={868}>
          <PhoneFrame theme="light"><PlanMobile/></PhoneFrame>
        </DCArtboard>
      </DCSection>

      {/* ──── 4. TRENDS ──── */}
      <DCSection id="trends" title="04 — Trends · 90 days">
        <DCArtboard id="trends-desktop" label="Desktop · dark" width={1280} height={1100}>
          <BrowserFrame url="luma.local/trends"><TrendsDesktop/></BrowserFrame>
        </DCArtboard>
        <DCArtboard id="trends-desktop-light" label="Desktop · light" width={1280} height={1100}>
          <BrowserFrame url="luma.local/trends" theme="light"><TrendsDesktop/></BrowserFrame>
        </DCArtboard>
      </DCSection>

      {/* ──── 5. COACH ──── */}
      <DCSection id="coach" title="05 — Coach">
        <DCArtboard id="coach-desktop" label="Desktop · dark" width={1280} height={900}>
          <BrowserFrame url="luma.local/coach"><CoachDesktop/></BrowserFrame>
        </DCArtboard>
        <DCArtboard id="coach-desktop-light" label="Desktop · light" width={1280} height={900}>
          <BrowserFrame url="luma.local/coach" theme="light"><CoachDesktop/></BrowserFrame>
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<LumaCanvas/>);

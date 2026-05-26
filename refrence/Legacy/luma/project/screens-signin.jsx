// Luma — Sign In screen

function SignInDesktop() {
  return (
    <div className="luma-bg" style={{ width: '100%', height: '100%', display: 'flex' }}>
      {/* Left — brand storytelling */}
      <div style={{
        flex: 1.05,
        padding: '60px 60px 40px',
        display: 'flex', flexDirection: 'column',
        position: 'relative',
      }}>
        <LumaWordmark size={32}/>

        <div style={{ marginTop: 'auto', maxWidth: 540 }}>
          <div className="eyebrow" style={{ marginBottom: 20, color: 'var(--sky-300)' }}>
            ◇ Your light, daily
          </div>
          <h1 style={{
            fontFamily: 'var(--font-sans)',
            fontWeight: 400,
            fontSize: 64, lineHeight: 1.02,
            letterSpacing: '-0.035em',
            margin: 0,
            color: 'var(--fg-primary)',
          }}>
            Track your body<br/>
            with{' '}
            <span className="serif-italic" style={{
              background: 'linear-gradient(120deg, #fde68a, #38bdf8 70%)',
              WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              fontSize: 72,
            }}>luminous</span><br/>
            clarity.
          </h1>
          <p style={{
            color: 'var(--fg-tertiary)',
            fontSize: 17, lineHeight: 1.6,
            marginTop: 28, maxWidth: 460,
          }}>
            A calm, self-hosted health companion. Your data stays on your hardware —
            insight, not surveillance.
          </p>

          {/* trust strip */}
          <div style={{
            marginTop: 56,
            display: 'flex', gap: 28,
            paddingTop: 28,
            borderTop: '1px solid rgba(255,255,255,0.06)',
          }}>
            {[
              { i: 'lock', l: 'Self-hosted', s: 'on your hardware' },
              { i: 'heart', l: 'LDL-aware', s: 'tuned for cardio health' },
              { i: 'sparkles', l: 'Claude-powered', s: 'gentle, not preachy' },
            ].map((f,i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 10,
                  background: 'rgba(56,189,248,0.12)',
                  border: '1px solid rgba(56,189,248,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--sky-300)', flexShrink: 0,
                }}>
                  <Icon name={f.i} size={15}/>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{f.l}</div>
                  <div style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>{f.s}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right — sign-in card */}
      <div style={{
        flex: 1,
        padding: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
      }}>
        {/* atmospheric blob */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse 60% 60% at 70% 30%, rgba(251,191,36,0.16), transparent 60%), radial-gradient(ellipse 60% 60% at 30% 80%, rgba(56,189,248,0.20), transparent 60%)',
          pointerEvents: 'none',
        }}/>

        <div className="glass" style={{
          width: '100%', maxWidth: 420,
          padding: 36,
          borderRadius: 28,
          position: 'relative',
        }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ display: 'inline-flex' }}><LumaLogo size={44}/></div>
            <h2 style={{
              margin: '18px 0 6px',
              fontSize: 24, fontWeight: 500,
              letterSpacing: '-0.02em',
            }}>Welcome back</h2>
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--fg-tertiary)' }}>
              Sign in to your private space
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <Field label="Email" icon="mail" value="operator@luma.local"/>
            <Field label="Password" icon="lock" type="password" value="••••••••••" trailing="eye"/>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--fg-tertiary)' }}>
                <span style={{
                  width: 16, height: 16, borderRadius: 5,
                  background: 'linear-gradient(180deg, #38bdf8, #0ea5e9)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4)',
                }}><Icon name="check" size={11} color="#061229" stroke={3}/></span>
                Stay signed in
              </label>
              <a style={{ fontSize: 12, color: 'var(--sky-300)' }}>Forgot password?</a>
            </div>

            <button className="btn btn-primary" style={{ marginTop: 8, padding: '14px 20px', fontSize: 14 }}>
              Sign in <Icon name="arrow-right" size={15}/>
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0 18px' }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }}/>
            <span style={{ fontSize: 11, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>or</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }}/>
          </div>

          <button className="btn" style={{ width: '100%', padding: '12px', justifyContent: 'center' }}>
            <Icon name="apple" size={16}/>
            Continue with passkey
          </button>

          <p style={{
            textAlign: 'center', fontSize: 11.5,
            color: 'var(--fg-quiet)', marginTop: 22,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--good)', boxShadow: '0 0 8px var(--good-glow)' }}/>
              Self-hosted
            </span>
            <span style={{ color: 'var(--fg-faint)' }}>·</span>
            <span>v0.4.2</span>
            <span style={{ color: 'var(--fg-faint)' }}>·</span>
            <span>End-to-end secure</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, icon, type = 'text', value, trailing }) {
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 8 }}>{label}</div>
      <div className="field-input" style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 14px',
        border: '1px solid var(--glass-edge)',
        borderRadius: 14,
      }}>
        <Icon name={icon} size={16} color="var(--fg-quiet)"/>
        <input type={type} defaultValue={value} style={{
          flex: 1, background: 'transparent', border: 'none', outline: 'none',
          color: 'var(--fg-primary)', fontFamily: 'var(--font-sans)', fontSize: 14,
        }}/>
        {trailing && <Icon name={trailing} size={16} color="var(--fg-quiet)"/>}
      </div>
    </div>
  );
}

function SignInMobile() {
  return (
    <div className="luma-bg" style={{ width: '100%', height: '100%', position: 'relative' }}>
      <StatusBar/>
      <div style={{
        padding: '8px 24px 0', height: 'calc(100% - 44px)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ marginTop: 28, marginBottom: 'auto', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', justifyContent: 'center' }}><LumaLogo size={56}/></div>
          <h1 style={{
            fontSize: 32, fontWeight: 400,
            letterSpacing: '-0.025em',
            margin: '22px 0 8px',
          }}>
            Welcome back
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--fg-tertiary)' }}>
            Your light, daily.
          </p>
        </div>

        <div className="glass" style={{ padding: 22, marginBottom: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Email" icon="mail" value="operator@luma.local"/>
            <Field label="Password" icon="lock" type="password" value="••••••••••" trailing="eye"/>
            <button className="btn btn-primary" style={{ marginTop: 6, padding: '14px 20px', fontSize: 14 }}>
              Sign in <Icon name="arrow-right" size={15}/>
            </button>
            <button className="btn" style={{ padding: '12px 16px', fontSize: 13, justifyContent: 'center' }}>
              <Icon name="apple" size={15}/>
              Use passkey
            </button>
          </div>
        </div>

        <p style={{
          textAlign: 'center', fontSize: 11,
          color: 'var(--fg-quiet)', margin: '0 0 28px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--good)' }}/>
            Self-hosted
          </span>
          <span style={{ color: 'var(--fg-faint)' }}>·</span>
          <span>luma.local</span>
        </p>
      </div>
    </div>
  );
}

window.SignInDesktop = SignInDesktop;
window.SignInMobile = SignInMobile;

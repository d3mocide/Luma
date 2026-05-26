// Mock biometric data for the Luma PWA UI kit.
// Mirrors the shape of TodayData / TrendSeries from source_refs/luma-web/lib/api.ts

window.LumaMockData = (function () {
  // ── generate a 90-day weight series with a slow downward trend ───────────
  function genWeight() {
    const out = [];
    const today = new Date();
    let w = 82.4;
    for (let i = 89; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      // smooth downward drift + daily noise
      w += -0.022 + (Math.random() - 0.5) * 0.45;
      out.push({ date: d.toISOString().slice(0, 10), last: +w.toFixed(2) });
    }
    return out;
  }

  function genMetric(base, jitter, min, max) {
    const out = [];
    const today = new Date();
    let v = base;
    for (let i = 89; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      v += (Math.random() - 0.5) * jitter;
      v = Math.max(min, Math.min(max, v));
      out.push({ date: d.toISOString().slice(0, 10), last: +v.toFixed(1) });
    }
    return out;
  }

  const weightSeries = genWeight();
  const latest = weightSeries[weightSeries.length - 1].last;
  const wk1   = weightSeries[weightSeries.length - 8].last;
  const wk4   = weightSeries[weightSeries.length - 29].last;

  return {
    today: {
      date: new Date().toISOString().slice(0, 10),
      weight: {
        latest_kg: latest,
        trend_7d:  +((latest - wk1) / 1).toFixed(2),
        trend_28d: +((latest - wk4) / 4).toFixed(2),
        target_kg: 75.0,
      },
      adherence_yesterday: {
        calories:        { logged: 1842, target: 1900, pct: 97 },
        sat_fat_g:       { logged: 14,   target: 12,   pct: 117 },
        soluble_fiber_g: { logged: 11,   target: 10,   pct: 110 },
      },
      biometrics_latest: {
        hrv_ms: 42,
        rhr_bpm: 58,
        sleep_score: 82,
        sleep_duration_min: 444,  // 7h 24m
      },
      plan_today: [
        { slot: 'breakfast', name: 'Oats with chia + blueberries',  logged: true  },
        { slot: 'lunch',     name: 'Salmon bowl, brown rice, kale', logged: true  },
        { slot: 'snack',     name: 'Apple + 20g almonds',            logged: false },
        { slot: 'dinner',    name: 'Lentil dal with quinoa',         logged: false },
      ],
      active_insight: {
        id: 'a1',
        severity: 'INFO',
        headline: 'Saturated fat ran 18% over target this week. Consider swapping cheese in two lunches.',
        cta: 'Open in Coach',
        thread_seed: 'sat_fat_high_week',
      },
    },
    trends: {
      weight_kg:          weightSeries,
      hrv_ms:             genMetric(45, 6,  20, 80),
      rhr_bpm:            genMetric(58, 3,  48, 72),
      sleep_duration_min: genMetric(440, 45, 300, 540),
      active_kcal:        genMetric(420, 120, 100, 800),
    },
    week_plan: [
      { day: 'Mon', slots: [
        { slot: 'breakfast', name: 'Oats with chia + blueberries' },
        { slot: 'lunch',     name: 'Salmon bowl, brown rice, kale' },
        { slot: 'dinner',    name: 'Lentil dal with quinoa' },
      ]},
      { day: 'Tue', slots: [
        { slot: 'breakfast', name: 'Greek yoghurt + walnuts' },
        { slot: 'lunch',     name: 'Tuna salad on rye' },
        { slot: 'dinner',    name: 'Sheet-pan chicken & veg' },
      ]},
      { day: 'Wed', slots: [
        { slot: 'breakfast', name: 'Overnight oats, banana' },
        { slot: 'lunch',     name: 'Chickpea & roasted veg bowl' },
        { slot: 'dinner',    name: 'Cod, lemon, white beans' },
      ]},
      { day: 'Thu', slots: [
        { slot: 'breakfast', name: 'Veggie scramble, sourdough' },
        { slot: 'lunch',     name: 'Mediterranean wrap' },
        { slot: 'dinner',    name: 'Stir-fried tofu, brown rice' },
      ]},
      { day: 'Fri', slots: [
        { slot: 'breakfast', name: 'Smoothie: oats, berries, flax' },
        { slot: 'lunch',     name: 'Quinoa tabbouleh + grilled fish' },
        { slot: 'dinner',    name: 'Black bean chili' },
      ]},
      { day: 'Sat', slots: [
        { slot: 'breakfast', name: 'Avocado toast, poached egg' },
        { slot: 'lunch',     name: 'Soup + open salmon sandwich' },
        { slot: 'dinner',    name: 'Roast chicken, sweet potato' },
      ]},
      { day: 'Sun', slots: [
        { slot: 'breakfast', name: 'Pancakes (oat flour) + berries' },
        { slot: 'lunch',     name: 'Big leafy salad + lentils' },
        { slot: 'dinner',    name: 'Pasta primavera' },
      ]},
    ],
    user: {
      id: 'u_seed',
      email: 'operator@luma.local',
      display_name: 'Operator',
      role: 'admin',
    },
  };
})();

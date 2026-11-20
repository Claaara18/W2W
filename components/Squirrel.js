import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Image, Pressable, Animated, Easing, StyleSheet, AccessibilityInfo, Dimensions } from 'react-native';
import * as Haptics from 'expo-haptics';

// ── W2W mascot ──
// Layered pose images stacked in one frame, hopping between "perches" (feet positions in the
// parent's coordinates). Imperative API via ref: goTo(name, opts), setPose(pose), celebrate(times),
// enter(name), stop() (freeze in place), isAt(name).
// Built-in Animated only, native driver, opacity/transform only. Never intercepts touches.

const IMG = {
  idle_tail:  require('../assets/mascot/idle_tail.png'),
  idle_body:  require('../assets/mascot/idle_body.png'),
  idle_blink: require('../assets/mascot/idle_blink.png'),
  think_body: require('../assets/mascot/think_body.png'),
  think_q:    require('../assets/mascot/think_q.png'),
  happy_tail: require('../assets/mascot/happy_tail.png'),
  happy_body: require('../assets/mascot/happy_body.png'),
  happy_spark:require('../assets/mascot/happy_spark.png'),
  acorn:      require('../assets/mascot/acorn.png'),
  sleep_body: require('../assets/mascot/sleep_body.png'),
  sleep_zzz:  require('../assets/mascot/sleep_zzz.png'),
};

export const SQUIRREL_W = 150;
export const SQUIRREL_H = 124;
const ANCHOR_X = SQUIRREL_W / 2;   // feet position inside the frame
const FEET_Y   = 6;                // feet sit this far above the frame bottom

// Size and horizontal offset (from the feet) of each pose, ~105pt tall
const POSE_BOX = {
  idle:  { width: 107, height: 109, left: -44 },
  happy: { width: 115, height: 116, left: -45 },
  think: { width: 115, height: 113, left: -37 },
  acorn: { width: 108, height: 111, left: -41 },
  sleep: { width: 135, height: 88,  left: -60 },
};
const POSES = Object.keys(POSE_BOX);

const rand = (a, b) => a + Math.random() * (b - a);

// 0 → 1 → 0 forever, each leg `ms` long
const pingPong = (v, ms, easing = Easing.inOut(Easing.sin)) =>
  Animated.loop(Animated.sequence([
    Animated.timing(v, { toValue: 1, duration: ms, easing, useNativeDriver: true }),
    Animated.timing(v, { toValue: 0, duration: ms, easing, useNativeDriver: true }),
  ]));

// 0 → 1, restart from 0, forever
const cycle = (v, ms, easing = Easing.linear) =>
  Animated.loop(Animated.timing(v, { toValue: 1, duration: ms, easing, useNativeDriver: true }));

const AIR = 0.82;   // airborne share of each hop; the rest is the landing squash
const SLEEP_AFTER = 12000;   // ms without user activity before dozing off

const log = (...args) => console.log('[squirrel]', ...args);

// Where a hop sequence is at `elapsed` ms — same maths as the prototype's hopTo()
const hopPoint = ({ x0, y0, tx, ty, n, ms }, elapsed) => {
  const t = Math.min(1, elapsed / (n * ms));
  const h = t * n;
  const i = Math.min(n - 1, Math.floor(h));
  const p = t >= 1 ? 1 : h - i;
  const g = (i + Math.min(1, p / AIR)) / n;
  return { x: x0 + (tx - x0) * g, y: y0 + (ty - y0) * g };
};

function Layer({ source, style }) {
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
      <Image source={source} style={styles.img} resizeMode="contain" />
    </Animated.View>
  );
}

function Squirrel({ perches = {}, paused = false, style }, ref) {
  const [pose, setPoseState] = useState('idle');
  const fades  = useRef(Object.fromEntries(POSES.map(p => [p, new Animated.Value(p === 'idle' ? 1 : 0)]))).current;
  const breath = useRef(new Animated.Value(0)).current;
  const tail   = useRef(new Animated.Value(0)).current;
  const sway   = useRef(new Animated.Value(0)).current;
  const qmark  = useRef(new Animated.Value(0)).current;
  const spark  = useRef(new Animated.Value(0)).current;
  const zzz    = useRef(new Animated.Value(0)).current;
  const blink  = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then(v => { if (alive) setReduceMotion(v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { alive = false; sub?.remove(); };
  }, []);

  // ── Movement ──
  const posX   = useRef(new Animated.Value(0)).current;   // feet position
  const posY   = useRef(new Animated.Value(0)).current;
  const dir    = useRef(new Animated.Value(1)).current;   // 1 = default facing, -1 = flipped
  const shown  = useRef(new Animated.Value(0)).current;
  // hopP / jumpP count whole hops/jumps (0 → n); the visual phase is their fractional part.
  // (No Animated.loop here: a native-driver loop never fires its completion callback.)
  const hopP   = useRef(new Animated.Value(0)).current;
  const hopH   = useRef(new Animated.Value(16)).current;
  const jumpP  = useRef(new Animated.Value(0)).current;
  const jumpH  = useRef(new Animated.Value(30)).current;
  const S = useRef({
    x: 0, y: 0, perch: null, token: 0, anim: null, motion: null, timers: [],
    entered: false, sleepTimer: null, taps: 0,
  }).current;
  const perchesRef = useRef(perches);
  const poseRef    = useRef('idle');
  const reduceRef  = useRef(reduceMotion);
  reduceRef.current = reduceMotion;
  const pausedRef  = useRef(paused);
  pausedRef.current = paused;
  const [entered, setEntered] = useState(false);   // hit area only exists once it's on screen
  const [excited, setExcited] = useState(false);   // brief fast tail-wag while idle

  const place = (x, y) => { S.x = x; S.y = y; posX.setValue(x); posY.setValue(y); };

  // Action timers: cleared by interrupt(), and drop out of S.timers once they fire
  const later = (fn, ms) => {
    const id = setTimeout(() => { S.timers = S.timers.filter(t => t !== id); fn(); }, ms);
    S.timers.push(id);
  };
  const wait = (ms) => new Promise(res => later(res, ms));

  // Free to wander / fall asleep: on screen, idle pose, not hopping, jumping or mid-celebration
  const canIdle = () =>
    S.entered && poseRef.current === 'idle' && !S.anim && !S.motion && S.timers.length === 0;

  // Stop whatever the squirrel is doing, freezing it where it currently is
  const interrupt = () => {
    S.token++;
    S.anim?.stop();
    S.anim = null;
    S.timers.forEach(clearTimeout);
    S.timers = [];
    if (S.motion) {
      const p = hopPoint(S.motion, Date.now() - S.motion.t0);
      S.motion = null;
      place(p.x, p.y);
    }
    hopP.setValue(0);
    jumpP.setValue(0);
  };

  useEffect(() => () => { interrupt(); clearTimeout(S.sleepTimer); }, []);

  // Keep a resting squirrel glued to its perch when layout shifts
  useEffect(() => {
    perchesRef.current = perches;
    const p = S.perch && perches[S.perch];
    if (p && !S.motion) place(p.x, p.y);
  }, [perches]);

  const setPose = (p) => {
    if (poseRef.current !== p) log('pose', poseRef.current, '→', p);
    poseRef.current = p;
    setPoseState(p);
    if (p !== 'idle') dir.setValue(1);
  };

  // Small hops toward (tx, ty): stretch on take-off, squash on landing, face the way we go
  const hopTo = (tx, ty, { step = 34, height = 16, ms = 220 } = {}) => new Promise(resolve => {
    const token = S.token;
    const x0 = S.x, y0 = S.y;
    const d  = Math.hypot(tx - x0, ty - y0);
    if (d < 2) return resolve(true);
    if (reduceRef.current) { place(tx, ty); return resolve(true); }

    const n = Math.max(1, Math.round(d / step));
    if (Math.abs(tx - x0) > 6) dir.setValue(tx > x0 ? -1 : 1);
    hopH.setValue(height);
    hopP.setValue(0);

    const hops = [];
    for (let i = 1; i <= n; i++) {
      hops.push(Animated.parallel([
        Animated.sequence([
          Animated.parallel([
            Animated.timing(posX, { toValue: x0 + (tx - x0) * i / n, duration: ms * AIR, easing: Easing.linear, useNativeDriver: true }),
            Animated.timing(posY, { toValue: y0 + (ty - y0) * i / n, duration: ms * AIR, easing: Easing.linear, useNativeDriver: true }),
          ]),
          Animated.delay(ms * (1 - AIR)),
        ]),
        Animated.timing(hopP, { toValue: i, duration: ms, easing: Easing.linear, useNativeDriver: true }),
      ]));
    }
    const anim = Animated.sequence(hops);
    S.anim   = anim;
    S.motion = { x0, y0, tx, ty, n, ms, t0: Date.now() };
    anim.start(() => {
      if (token !== S.token) return resolve(false);   // interrupted
      S.anim = null;
      S.motion = null;
      S.x = tx; S.y = ty;
      hopP.setValue(0);
      resolve(true);
    });
  });

  const goTo = (name, opts) => {
    const p = perchesRef.current[name];
    if (!p) return Promise.resolve(false);
    interrupt();
    S.perch = name;
    return hopTo(p.x, p.y, opts);
  };

  // Jump on the spot (430ms each): crouch → up `h` → land squash → rest
  const jump = (times, h) => new Promise(resolve => {
    const token = S.token;
    if (reduceRef.current) return resolve(true);
    jumpH.setValue(h);
    jumpP.setValue(0);
    const anim = Animated.sequence(Array.from({ length: times }, (_, i) =>
      Animated.timing(jumpP, { toValue: i + 1, duration: 430, easing: Easing.bezier(0.2, 0.7, 0.4, 1), useNativeDriver: true })
    ));
    S.anim = anim;
    anim.start(() => {
      if (token !== S.token) return resolve(false);
      S.anim = null;
      jumpP.setValue(0);
      resolve(true);
    });
  });

  // Happy (or acorn) hops on the spot, 30pt high, with a light buzz, then back to idle
  const celebrate = async (times = 2, { pose: p = 'happy', haptic = true } = {}) => {
    interrupt();
    const token = S.token;
    setPose(p);
    if (haptic) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      later(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}), 50);
    }
    if (reduceRef.current) {
      await wait(900);
    } else {
      if (!(await jump(times, 30))) return false;
      await wait(520);
    }
    if (token !== S.token) return false;
    setPose('idle');
    return true;
  };

  const wake = (reason = 'wake') => {
    if (poseRef.current !== 'sleep') return;
    log('woke up —', reason);
    interrupt();
    setPose('idle');
    jump(1, 14);
  };

  // Sleep countdown: one timer, re-armed only by real user activity (and on focus).
  // If it fires while busy (thinking, hopping, celebrating) it re-checks every second.
  const trySleep = () => {
    if (pausedRef.current) return;
    if (canIdle()) { log('fell asleep'); setPose('sleep'); }
    else S.sleepTimer = setTimeout(trySleep, 1000);
  };
  const armSleep = (reason) => {
    clearTimeout(S.sleepTimer);
    log(`sleep timer reset (${SLEEP_AFTER / 1000}s) —`, reason);
    S.sleepTimer = setTimeout(trySleep, SLEEP_AFTER);
  };

  // User activity — only call for taps, scrolls and recommend presses
  const touch = (reason = 'activity') => {
    if (!pausedRef.current) armSleep(reason);
    wake(reason);
  };

  // Tap on the squirrel itself: wake if asleep, otherwise alternate happy / acorn hops
  const onTap = () => {
    const wasAsleep = poseRef.current === 'sleep';
    touch('tap squirrel');
    if (wasAsleep || !canIdle()) return;
    const p = S.taps++ % 2 === 0 ? 'happy' : 'acorn';
    log('tapped →', p);
    celebrate(1, { pose: p });
  };

  // One small hop near the current perch, within the perch's wander range (default ±20)
  const wander = () => {
    const p = perchesRef.current[S.perch];
    if (!p || reduceRef.current) return;
    const [lo, hi] = p.wander ?? [-20, 20];
    const tx = p.x + rand(lo, hi);
    if (Math.abs(tx - S.x) < 6) return;
    log('wander', S.perch, `${Math.round(tx - p.x)}px`);
    hopTo(tx, p.y, { step: 15, height: 9, ms: 210 });
  };

  // Idle life while focused: wander / wag every 2.4–4.8s, plus the sleep countdown.
  // Leaving the tab clears both; coming back starts them again.
  useEffect(() => {
    if (paused) { log('paused (tab out of focus)'); clearTimeout(S.sleepTimer); return; }
    armSleep('focused');
    let tickTimer, wagTimer;
    const tick = () => {
      if (canIdle()) {
        const r = Math.random();
        if (r < 0.5) wander();
        else if (r < 0.75) {
          log('tail wag');
          setExcited(true);
          clearTimeout(wagTimer);
          wagTimer = setTimeout(() => setExcited(false), 900);
        }
      }
      tickTimer = setTimeout(tick, rand(2400, 4800));
    };
    tickTimer = setTimeout(tick, rand(2400, 4800));
    return () => {
      clearTimeout(tickTimer);
      clearTimeout(wagTimer);
      clearTimeout(S.sleepTimer);
      setExcited(false);
    };
  }, [paused]);

  // Hop in from off-screen right, land on the perch, one happy jump
  const enter = async (name = 'hero') => {
    const p = perchesRef.current[name];
    if (!p) return;
    interrupt();
    place(Dimensions.get('window').width + 70, p.y);
    Animated.timing(shown, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    S.perch = name;
    S.entered = true;
    setEntered(true);
    const arrived = await hopTo(p.x, p.y, { step: 36, height: 18, ms: 220 });
    if (!arrived) return;
    dir.setValue(1);
    await celebrate(1, { haptic: false });
  };

  // Resting at that perch right now (not mid-hop; idle wandering still counts)?
  const isAt = (name) => {
    const p = perchesRef.current[name];
    return !!p && S.perch === name && !S.motion && Math.hypot(S.x - p.x, S.y - p.y) < 24;
  };

  useImperativeHandle(ref, () => ({ goTo, setPose, celebrate, enter, stop: interrupt, isAt, touch, wake }));

  // Pose switch: 150ms cross-fade
  useEffect(() => {
    const a = Animated.parallel(POSES.map(p =>
      Animated.timing(fades[p], { toValue: p === pose ? 1 : 0, duration: 150, useNativeDriver: true })
    ));
    a.start();
    return () => a.stop();
  }, [pose]);

  // Idle life for the active pose; everything is stopped/cleared on change, pause or unmount
  useEffect(() => {
    if (paused) return;
    const anims  = [];
    const timers = [];
    const run   = (a) => { anims.push(a); a.start(); };
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));

    if (pose === 'idle') {
      const blinkOnce = (ms, then) => {
        blink.setValue(1);
        later(() => { blink.setValue(0); then?.(); }, ms);
      };
      const scheduleBlink = () => later(() => {
        blinkOnce(130);
        if (Math.random() < 0.25) later(() => blinkOnce(110), 260);
        scheduleBlink();
      }, rand(1800, 4600));
      scheduleBlink();
    }

    if (!reduceMotion) {
      if (pose === 'idle')  { run(pingPong(breath, 1600)); run(pingPong(tail, excited ? 260 : 2300)); }
      if (pose === 'think') { run(pingPong(sway, 750));    run(cycle(qmark, 1000, Easing.inOut(Easing.sin))); }
      if (pose === 'happy') { run(pingPong(tail, 260));    run(pingPong(spark, 500)); }
      if (pose === 'acorn') { run(pingPong(breath, 1100)); }
      if (pose === 'sleep') { run(pingPong(breath, 1800)); run(cycle(zzz, 2800, Easing.inOut(Easing.sin))); }
    }

    return () => {
      anims.forEach(a => a.stop());
      timers.forEach(clearTimeout);
      [breath, tail, sway, qmark, spark, zzz, blink].forEach(v => v.setValue(0));
    };
  }, [pose, paused, reduceMotion, excited]);

  const tailRot = tail.interpolate({ inputRange: [0, 1], outputRange: ['1.6deg', '-6.5deg'] });
  const breathe = (sx, sy) => [
    { scaleX: breath.interpolate({ inputRange: [0, 1], outputRange: [1, sx] }) },
    { scaleY: breath.interpolate({ inputRange: [0, 1], outputRange: [1, sy] }) },
  ];

  const box = (p) => ({ ...POSE_BOX[p], left: ANCHOR_X + POSE_BOX[p].left, bottom: FEET_Y });
  const poseStyle = (p, transform) => [styles.pose, box(p), { opacity: fades[p] }, transform && { transform }];

  // Phase within the current hop / jump (0→1, back to 0 at rest)
  const hopPh  = Animated.modulo(hopP, 1);
  const jumpPh = Animated.modulo(jumpP, 1);

  // Hop: lift on a sine-ish arc, stretch in the air, squash on landing; shadow shrinks while airborne
  const hopLift = Animated.multiply(
    hopPh.interpolate({ inputRange: [0, 0.2, 0.41, 0.62, AIR, 1], outputRange: [0, -0.69, -1, -0.69, 0, 0] }),
    hopH,
  );
  const hopSX  = hopPh.interpolate({ inputRange: [0, 0.41, AIR, 0.91, 1], outputRange: [1, 0.95, 1, 1.07, 1] });
  const hopSY  = hopPh.interpolate({ inputRange: [0, 0.41, AIR, 0.91, 1], outputRange: [1, 1.07, 1, 0.91, 1] });
  const hopShd = hopPh.interpolate({ inputRange: [0, 0.41, AIR, 1], outputRange: [1, 0.7, 1, 1] });
  // Jump (celebrate): quick crouch → up → land squash → rest (phase 0 must be the resting pose)
  const jumpLift = Animated.multiply(
    jumpPh.interpolate({ inputRange: [0, 0.06, 0.24, 0.42, 0.62, 0.82, 1], outputRange: [0, 0, -0.75, -1, -0.75, 0, 0] }),
    jumpH,
  );
  const jumpSX  = jumpPh.interpolate({ inputRange: [0, 0.06, 0.42, 0.82, 1], outputRange: [1, 1.1, 0.95, 1.1, 1] });
  const jumpSY  = jumpPh.interpolate({ inputRange: [0, 0.06, 0.42, 0.82, 1], outputRange: [1, 0.86, 1.07, 0.88, 1] });
  const jumpShd = jumpPh.interpolate({ inputRange: [0, 0.42, 0.82, 1], outputRange: [1, 0.7, 1, 1] });
  const shadowS = Animated.multiply(hopShd, jumpShd);

  return (
    // Only the body-sized hit area below takes touches; everything visual passes them through
    <Animated.View
      pointerEvents={entered ? 'box-none' : 'none'}
      style={[styles.frame, style, {
        opacity: shown,
        transform: [
          { translateX: Animated.add(posX, -ANCHOR_X) },
          { translateY: Animated.add(posY, -(SQUIRREL_H - FEET_Y)) },
        ],
      }]}
    >
      <Animated.View pointerEvents="none" style={[styles.shadow, {
        transform: [{ scaleX: shadowS }, { scaleY: Animated.multiply(shadowS, 11 / 72) }],
      }]} />

      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { transform: [{ scaleX: dir }] }]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.squash, {
        transform: [
          { translateY: Animated.add(hopLift, jumpLift) },
          { scaleX: Animated.multiply(hopSX, jumpSX) },
          { scaleY: Animated.multiply(hopSY, jumpSY) },
        ],
      }]}>

          {/* idle: wagging tail + body, blink overlay, 3.2s breathing */}
          <Animated.View style={poseStyle('idle', breathe(1.012, 1.022))}>
            <Layer source={IMG.idle_tail} style={{ transformOrigin: '67% 92%', transform: [{ rotate: tailRot }] }} />
            <Layer source={IMG.idle_body} style={{ opacity: blink.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }} />
            <Layer source={IMG.idle_blink} style={{ opacity: blink }} />
          </Animated.View>

          {/* think: body sways ±2.2°, question mark bobs */}
          <Animated.View style={poseStyle('think', [
            { rotate: sway.interpolate({ inputRange: [0, 1], outputRange: ['-2.2deg', '2.2deg'] }) },
          ])}>
            <Layer source={IMG.think_body} />
            <Layer source={IMG.think_q} style={{
              transformOrigin: '10% 12%',
              transform: [
                { translateY: qmark.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -5, 0] }) },
                { rotate: qmark.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['-6deg', '8deg', '-6deg'] }) },
              ],
            }} />
          </Animated.View>

          {/* happy: fast tail, body, twinkling spark */}
          <Animated.View style={poseStyle('happy')}>
            <Layer source={IMG.happy_tail} style={{ transformOrigin: '66% 89%', transform: [{ rotate: tailRot }] }} />
            <Layer source={IMG.happy_body} />
            <Layer source={IMG.happy_spark} style={{
              transformOrigin: '6% 20%',
              opacity: spark.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
              transform: [{ scale: spark.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.15] }) }],
            }} />
          </Animated.View>

          {/* acorn: hugging an acorn, 2.2s breathing */}
          <Animated.View style={poseStyle('acorn', breathe(1.012, 1.022))}>
            <Layer source={IMG.acorn} />
          </Animated.View>

          {/* sleep: slow breathing, zzz drifts up-right and fades (2.8s) */}
          <Animated.View style={poseStyle('sleep', breathe(1.02, 1.045))}>
            <Layer source={IMG.sleep_body} />
            <Animated.View style={[styles.zzz, {
              opacity: zzz.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 0] }),
              transform: [
                { translateX: zzz.interpolate({ inputRange: [0, 1], outputRange: [-4, 6] }) },
                { translateY: zzz.interpolate({ inputRange: [0, 1], outputRange: [6, -10] }) },
                { scale:      zzz.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.08] }) },
              ],
            }]}>
              <Image source={IMG.sleep_zzz} style={styles.img} resizeMode="contain" />
            </Animated.View>
          </Animated.View>
      </Animated.View>
      </Animated.View>

      <Pressable style={styles.hit} onPress={onTap} accessibilityRole="button" accessibilityLabel="松鼠" />
    </Animated.View>
  );
}

export default forwardRef(Squirrel);

const styles = StyleSheet.create({
  // Absolutely placed at the parent's origin; translate moves the feet onto a perch
  frame:  {
    position: 'absolute', left: 0, top: 0, width: SQUIRREL_W, height: SQUIRREL_H,
    zIndex: 20, elevation: 20,
  },
  squash: { transformOrigin: `50% ${((SQUIRREL_H - FEET_Y) / SQUIRREL_H) * 100}%` },
  pose:   { position: 'absolute', transformOrigin: '50% 100%' },
  img:    { width: '100%', height: '100%' },
  shadow: {
    position: 'absolute', left: ANCHOR_X - 36, bottom: FEET_Y - 36,
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(70,45,15,0.16)',
  },
  zzz: { position: 'absolute', left: 20, top: -14, width: 33, height: 30 },
  hit: { position: 'absolute', left: ANCHOR_X - 40, bottom: FEET_Y, width: 80, height: 100, borderRadius: 40 },
});

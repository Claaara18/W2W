import React, { useEffect, useRef, useState } from 'react';
import { View, Image, Animated, Easing, StyleSheet, AccessibilityInfo } from 'react-native';

// ── W2W mascot ──
// Layered pose images stacked in one frame. 3a: poses + idle life only (no movement yet).
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

function Layer({ source, style }) {
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
      <Image source={source} style={styles.img} resizeMode="contain" />
    </Animated.View>
  );
}

export default function Squirrel({ pose = 'idle', paused = false, style }) {
  const fades  = useRef(Object.fromEntries(POSES.map(p => [p, new Animated.Value(p === pose ? 1 : 0)]))).current;
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
      if (pose === 'idle')  { run(pingPong(breath, 1600)); run(pingPong(tail, 2300)); }
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
  }, [pose, paused, reduceMotion]);

  const tailRot = tail.interpolate({ inputRange: [0, 1], outputRange: ['1.6deg', '-6.5deg'] });
  const breathe = (sx, sy) => [
    { scaleX: breath.interpolate({ inputRange: [0, 1], outputRange: [1, sx] }) },
    { scaleY: breath.interpolate({ inputRange: [0, 1], outputRange: [1, sy] }) },
  ];

  const box = (p) => ({ ...POSE_BOX[p], left: ANCHOR_X + POSE_BOX[p].left, bottom: FEET_Y });
  const poseStyle = (p, transform) => [styles.pose, box(p), { opacity: fades[p] }, transform && { transform }];

  return (
    <View pointerEvents="none" style={[styles.frame, style]}>
      <View style={styles.shadow} />

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
    </View>
  );
}

const styles = StyleSheet.create({
  frame:  { width: SQUIRREL_W, height: SQUIRREL_H },
  pose:   { position: 'absolute', transformOrigin: '50% 100%' },
  img:    { width: '100%', height: '100%' },
  shadow: {
    position: 'absolute', left: ANCHOR_X - 36, bottom: FEET_Y - 36,
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(70,45,15,0.16)',
    transform: [{ scaleY: 11 / 72 }],
  },
  zzz: { position: 'absolute', left: 20, top: -14, width: 33, height: 30 },
});

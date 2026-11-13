import test from 'node:test';
import assert from 'node:assert/strict';
import { Effect, sampleEffect } from '../src/caibei/effects.js';
import { compileComposition, Composition, vfx } from '../src/caibei/index.js';
import { createProject, parseProject, validateProject } from '../src/core/project.js';

const burst = { id: 'fx-1', name: '爆开', preset: 'burst', start: 1, end: 2.5, position: [0, 1.4, 0], seed: 3 };

test('特效只在自己的时间段里出现，同一时间采样稳定', () => {
  assert.equal(sampleEffect(burst, 0.9).alive, false);
  const mid = sampleEffect(burst, 1.4);
  assert.equal(mid.alive, true);
  assert.ok(mid.particles.length > 4);
  assert.ok(mid.light > 0);
  assert.deepEqual(sampleEffect(burst, 1.4), mid);
  assert.equal(sampleEffect(burst, 2.5).alive, false);
  const later = sampleEffect(burst, 1.9);
  const spreadMid = Math.hypot(mid.particles[0].x, mid.particles[0].z);
  const spreadLater = Math.hypot(later.particles[0].x, later.particles[0].z);
  assert.ok(spreadLater >= spreadMid - 0.05);
});

test('四种特效都能采样，烟雾比火花更大更淡', () => {
  for (const preset of ['spark', 'smoke', 'glow', 'burst']) {
    const sample = sampleEffect({ ...burst, preset, seed: 8 }, 1.5);
    assert.equal(sample.alive, true, preset);
    assert.ok(sample.particles.every(particle => particle.opacity > 0 && particle.size > 0), preset);
  }
  const smoke = sampleEffect({ ...burst, preset: 'smoke' }, 1.7);
  const spark = sampleEffect({ ...burst, preset: 'spark' }, 1.7);
  assert.ok(Math.max(...smoke.particles.map(particle => particle.size)) > Math.max(...spark.particles.map(particle => particle.size)));
});

test('特效脚本烘进项目，旧工程没有特效字段也能打开', () => {
  const project = compileComposition(Composition({
    name: '放一朵火花',
    fps: 30,
    duration: 4,
    effects: [vfx.spark({ from: 1, duration: 1.2, position: [1, 2, 3], seed: 5 })],
  }));
  validateProject(project);
  assert.equal(project.effects[0].preset, 'spark');
  assert.equal(project.effects[0].start, 1);
  assert.equal(project.effects[0].position[1], 2);
  assert.equal(Effect({ preset: 'glow' }).preset, 'glow');
  const legacy = createProject();
  delete legacy.effects;
  assert.deepEqual(parseProject(JSON.stringify(legacy)).effects, []);
});

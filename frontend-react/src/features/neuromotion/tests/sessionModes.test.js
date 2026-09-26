import { describe, it, expect } from 'vitest';
import {
  SESSION_MODES,
  UNKNOWN_SESSION_MODE,
  normalizeSessionType,
  getSessionMode,
  cameraRequired,
  microphoneRequired,
  trackingMode,
  transformLandmarkToCanvas
} from '../../../services/sessionModes';

describe('Canonical Session Modes Contract & Camera Policy', () => {
  it('correctly declares camera requirements for the 4 core modes', () => {
    expect(cameraRequired('gait_trainer')).toBe(true);
    expect(cameraRequired('balance_training')).toBe(true);
    expect(cameraRequired('finger_tapping')).toBe(false);
    expect(cameraRequired('speech_rhythm')).toBe(false);
  });

  it('correctly declares microphone requirements', () => {
    expect(microphoneRequired('speech_rhythm')).toBe(true);
    expect(microphoneRequired('melodic_intonation')).toBe(true);
    expect(microphoneRequired('gait_trainer')).toBe(false);
    expect(microphoneRequired('balance_training')).toBe(false);
    expect(microphoneRequired('finger_tapping')).toBe(false);
  });

  it('correctly maps tracking modes', () => {
    expect(trackingMode('gait_trainer')).toBe('gait');
    expect(trackingMode('balance_training')).toBe('balance');
    expect(trackingMode('finger_tapping')).toBe('tapping');
    expect(trackingMode('speech_rhythm')).toBe('speech');
  });

  it('normalizes common aliases accurately', () => {
    expect(normalizeSessionType('gait')).toBe('gait_trainer');
    expect(normalizeSessionType('walking')).toBe('gait_trainer');
    expect(normalizeSessionType('balance')).toBe('balance_training');
    expect(normalizeSessionType('tapping')).toBe('finger_tapping');
    expect(normalizeSessionType('finger-tapping')).toBe('finger_tapping');
    expect(normalizeSessionType('speech')).toBe('speech_rhythm');
  });

  it('safely handles unknown and null types without defaulting to gait_trainer', () => {
    expect(normalizeSessionType('unknown_modality')).toBe('unknown');
    expect(normalizeSessionType('')).toBe('unknown');
    expect(normalizeSessionType(null)).toBe('unknown');
    expect(normalizeSessionType(undefined)).toBe('unknown');

    const unknownMode = getSessionMode('unrecognized_action');
    expect(unknownMode.key).toBe('unknown');
    expect(unknownMode.title).not.toBe('Gait Trainer');
    expect(unknownMode.cameraRequired).toBe(false);
    expect(unknownMode.trackingMode).toBe('none');
    expect(cameraRequired('unrecognized_action')).toBe(false);
  });
});

describe('Landmark-to-Screen Transformation (Coordinate System)', () => {
  it('projects landmark 1:1 when canvas and video aspect ratios match', () => {
    const lm = { x: 0.5, y: 0.5, visibility: 0.9 };
    const pt = transformLandmarkToCanvas(lm, 640, 480, 640, 480, 'contain', false);
    expect(pt.x).toBe(320);
    expect(pt.y).toBe(240);
    expect(pt.renderRect.offsetX).toBe(0);
    expect(pt.renderRect.offsetY).toBe(0);
  });

  it('computes letterboxing offsets when canvas is taller than video', () => {
    // 16:9 video (1600x900) in a 4:3 canvas (1600x1200)
    // Rendered height should be 1600 / (16/9) = 900
    // offsetY = (1200 - 900) / 2 = 150
    const lm = { x: 0.5, y: 0.0, visibility: 0.9 };
    const pt = transformLandmarkToCanvas(lm, 1600, 900, 1600, 1200, 'contain', false);
    expect(pt.renderRect.width).toBe(1600);
    expect(pt.renderRect.height).toBe(900);
    expect(pt.renderRect.offsetX).toBe(0);
    expect(pt.renderRect.offsetY).toBe(150);
    expect(pt.x).toBe(800);
    expect(pt.y).toBe(150); // Offset applied to top
  });

  it('computes pillarboxing offsets when canvas is wider than video', () => {
    // 4:3 video (400x300) in a 16:9 canvas (1600x900)
    // Rendered width should be 900 * (4/3) = 1200
    // offsetX = (1600 - 1200) / 2 = 200
    const lm = { x: 0.0, y: 0.5, visibility: 0.9 };
    const pt = transformLandmarkToCanvas(lm, 400, 300, 1600, 900, 'contain', false);
    expect(pt.renderRect.width).toBe(1200);
    expect(pt.renderRect.height).toBe(900);
    expect(pt.renderRect.offsetX).toBe(200);
    expect(pt.renderRect.offsetY).toBe(0);
    expect(pt.x).toBe(200); // Offset applied to left
    expect(pt.y).toBe(450);
  });

  it('handles mathematical horizontal mirroring correctly', () => {
    const lm = { x: 0.25, y: 0.5, visibility: 0.9 };
    const unmirrored = transformLandmarkToCanvas(lm, 640, 480, 640, 480, 'contain', false);
    const mirrored = transformLandmarkToCanvas(lm, 640, 480, 640, 480, 'contain', true);
    expect(unmirrored.x).toBe(160);
    expect(mirrored.x).toBe(480); // (1 - 0.25) * 640 = 0.75 * 640 = 480
    expect(mirrored.y).toBe(240);
  });
});

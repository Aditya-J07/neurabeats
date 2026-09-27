/**
 * Skeleton Overlay Component
 * High-performance 2D Canvas renderer for MediaPipe 33-landmark skeleton.
 * Aligns pixel-perfectly with mirrored video feed by matching intrinsic video dimensions
 * and mirror transformations.
 */

import React, { useEffect, useRef } from 'react';
import { LANDMARKS, SKELETON_SEGMENTS } from '../core/PoseTypes';

export default function SkeletonOverlay({
  landmarksData,
  canvasRef,
  videoRef,
  lastStep = null,
}) {
  const animRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef?.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      // 1. Synchronize canvas resolution with actual video stream resolution
      const video = videoRef?.current;
      const targetWidth = video?.videoWidth || canvas.clientWidth || 640;
      const targetHeight = video?.videoHeight || canvas.clientHeight || 480;

      if (targetWidth > 0 && targetHeight > 0 && (canvas.width !== targetWidth || canvas.height !== targetHeight)) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const landmarks = landmarksData?.filteredLandmarks || landmarksData?.rawLandmarks;

      if (landmarks && landmarks.length >= 33) {
        const scale = Math.max(1, canvas.width / 640);

        // Helper to project normalized landmark to canvas coordinates
        const toCanvas = (lm) => ({
          x: lm.x * canvas.width,
          y: lm.y * canvas.height,
          vis: lm.visibility ?? 1.0,
        });

        // Draw Segment Lines
        const drawSegment = (p1Idx, p2Idx, strokeStyle, lineWidth = 4, glowColor = null) => {
          const p1 = toCanvas(landmarks[p1Idx]);
          const p2 = toCanvas(landmarks[p2Idx]);
          if (p1.vis < 0.30 || p2.vis < 0.30) return;

          // Glow shadow pass
          if (glowColor) {
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = glowColor;
            ctx.lineWidth = lineWidth * 2;
            ctx.lineCap = 'round';
            ctx.stroke();
          }

          // Main line pass
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = strokeStyle;
          ctx.lineWidth = lineWidth;
          ctx.lineCap = 'round';
          ctx.stroke();
        };

        // 1. Torso: Vibrant Emerald / Teal
        SKELETON_SEGMENTS.TORSO.forEach(([i1, i2]) => {
          drawSegment(i1, i2, '#10B981', 5 * scale, 'rgba(16, 185, 129, 0.3)');
        });

        // 2. Left Leg: Vibrant Electric Blue
        SKELETON_SEGMENTS.LEFT_LEG.forEach(([i1, i2]) => {
          drawSegment(i1, i2, '#3B82F6', 5 * scale, 'rgba(59, 130, 246, 0.35)');
        });

        // 3. Right Leg: Coral / Rose
        SKELETON_SEGMENTS.RIGHT_LEG.forEach(([i1, i2]) => {
          drawSegment(i1, i2, '#F43F5E', 5 * scale, 'rgba(244, 63, 94, 0.35)');
        });

        // 4. Arms: Cyan
        SKELETON_SEGMENTS.LEFT_ARM.forEach(([i1, i2]) => {
          drawSegment(i1, i2, '#06B6D4', 3 * scale);
        });
        SKELETON_SEGMENTS.RIGHT_ARM.forEach(([i1, i2]) => {
          drawSegment(i1, i2, '#06B6D4', 3 * scale);
        });

        // 5. Draw Key Joints with Glow
        const drawJoint = (idx, color, radius = 6) => {
          const pt = toCanvas(landmarks[idx]);
          if (pt.vis < 0.30) return;

          const r = radius * scale;

          // Outer halo / glow
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, r + 3 * scale, 0, 2 * Math.PI);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.fill();

          // Main node
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, r, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();

          // Core bright center
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, r * 0.45, 0, 2 * Math.PI);
          ctx.fillStyle = '#FFFFFF';
          ctx.fill();
        };

        // Lower body joints
        drawJoint(LANDMARKS.LEFT_HIP, '#10B981', 7);
        drawJoint(LANDMARKS.RIGHT_HIP, '#10B981', 7);
        drawJoint(LANDMARKS.LEFT_KNEE, '#3B82F6', 7);
        drawJoint(LANDMARKS.RIGHT_KNEE, '#F43F5E', 7);
        drawJoint(LANDMARKS.LEFT_ANKLE, '#60A5FA', 8);
        drawJoint(LANDMARKS.RIGHT_ANKLE, '#FB7185', 8);
        drawJoint(LANDMARKS.LEFT_HEEL, '#93C5FD', 6);
        drawJoint(LANDMARKS.RIGHT_HEEL, '#FDA4AF', 6);
        drawJoint(LANDMARKS.LEFT_FOOT_INDEX, '#BFDBFE', 6);
        drawJoint(LANDMARKS.RIGHT_FOOT_INDEX, '#FECDD3', 6);

        // Upper body reference joints
        drawJoint(LANDMARKS.LEFT_SHOULDER, '#10B981', 6);
        drawJoint(LANDMARKS.RIGHT_SHOULDER, '#10B981', 6);
        drawJoint(LANDMARKS.NOSE, '#E2E8F0', 5);

        // Foot Strike Ripple Effect
        if (lastStep && performance.now() / 1000 - lastStep.timestamp < 0.5) {
          const footIdx = lastStep.side === 'LEFT' ? LANDMARKS.LEFT_ANKLE : LANDMARKS.RIGHT_ANKLE;
          const strikePt = toCanvas(landmarks[footIdx]);
          const age = performance.now() / 1000 - lastStep.timestamp;
          const r = (10 + age * 80) * scale;
          const alpha = Math.max(0, 1.0 - age * 2.0);

          ctx.beginPath();
          ctx.arc(strikePt.x, strikePt.y, r, 0, 2 * Math.PI);
          ctx.strokeStyle = lastStep.side === 'LEFT'
            ? `rgba(59, 130, 246, ${alpha})`
            : `rgba(244, 63, 94, ${alpha})`;
          ctx.lineWidth = 3.5 * scale;
          ctx.stroke();
        }
      }

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [landmarksData, lastStep, canvasRef, videoRef]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        objectFit: 'fill',
        transform: 'scaleX(-1)', // EXACT MATCH with video mirroring
        zIndex: 3,
      }}
    />
  );
}

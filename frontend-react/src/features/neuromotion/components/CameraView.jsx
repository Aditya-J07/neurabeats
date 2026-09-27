/**
 * CameraView Component
 * Hosts video stream, Canvas skeleton overlay, Patient Body Framing Silhouette Guide,
 * and graceful fallback for disconnected webcams.
 * Guarantees pixel-perfect overlay by locking canvas and video to identical aspect ratio and mirror transform.
 */

import React, { useState, useEffect } from 'react';
import SkeletonOverlay from './SkeletonOverlay';
import SilhouetteGuide from './SilhouetteGuide';
import { Camera, CameraOff, Sparkles, Eye, EyeOff } from 'lucide-react';

export default function CameraView({
  videoRef,
  canvasRef,
  landmarksData,
  trackingState = 'LOST',
  confidence = 0,
  framing = null,
  lastStep = null,
  isDemoMode = false,
  fps = 0,
  latencyMs = 0,
  errorMessage = null,
  onSwitchToDemo = null,
}) {
  const [showSilhouetteGuide, setShowSilhouetteGuide] = useState(true);
  const [videoAspectRatio, setVideoAspectRatio] = useState('4 / 3');

  // Track video aspect ratio dynamically to ensure pixel-perfect canvas alignment
  useEffect(() => {
    const video = videoRef?.current;
    if (!video) return;

    const updateRatio = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        setVideoAspectRatio(`${video.videoWidth} / ${video.videoHeight}`);
      }
    };

    video.addEventListener('loadedmetadata', updateRatio);
    video.addEventListener('resize', updateRatio);
    updateRatio();

    return () => {
      video.removeEventListener('loadedmetadata', updateRatio);
      video.removeEventListener('resize', updateRatio);
    };
  }, [videoRef]);

  const getBadgeStyle = (state) => {
    switch (state) {
      case 'TRACKING':
      case 'MOVING':
        return { bg: 'rgba(16, 185, 129, 0.2)', border: '#10B981', text: '#10B981', label: 'TRACKING ACTIVE' };
      case 'STATIONARY':
        return { bg: 'rgba(59, 130, 246, 0.2)', border: '#3B82F6', text: '#3B82F6', label: 'BODY READY (STATIONARY)' };
      case 'UNCERTAIN':
        return { bg: 'rgba(245, 158, 11, 0.2)', border: '#F59E0B', text: '#F59E0B', label: 'PARTIAL POSE' };
      default:
        return { bg: 'rgba(239, 68, 68, 0.2)', border: '#EF4444', text: '#EF4444', label: 'NO POSE DETECTED' };
    }
  };

  const badge = getBadgeStyle(trackingState);

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '380px',
      backgroundColor: '#0A0F1D',
      borderRadius: '16px',
      overflow: 'hidden',
      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      {/* Synchronized Video & Skeleton Stage (Locked to identical bounds and mirror transform) */}
      <div style={{
        position: 'relative',
        height: '100%',
        aspectRatio: videoAspectRatio,
        maxHeight: '100%',
        maxWidth: '100%',
        overflow: 'hidden',
        backgroundColor: '#000000',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {/* HTML5 Video Element */}
        <video
          ref={videoRef}
          playsInline
          muted
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'fill', // Identical to canvas
            transform: 'scaleX(-1)', // Mirror user view
            display: isDemoMode ? 'none' : 'block',
          }}
        />

        {/* Demo Mode Visual Background if video not active */}
        {isDemoMode && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(circle at center, #1E293B 0%, #0F172A 100%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#94A3B8',
            zIndex: 1,
          }}>
            <Sparkles size={36} color="#38BDF8" style={{ marginBottom: '8px' }} />
            <span style={{ fontSize: '15px', fontWeight: 700, color: '#E2E8F0' }}>
              DEMO GAIT SYNTHESIZER ACTIVE
            </span>
            <span style={{ fontSize: '12px', color: '#64748B' }}>
              Simulating natural bilateral kinematics • MediaPipe Pose Full (33 Keypoints)
            </span>
          </div>
        )}

        {/* Canvas Skeleton Overlay - exactly matching video bounds and mirror transform */}
        <SkeletonOverlay
          canvasRef={canvasRef}
          videoRef={videoRef}
          landmarksData={landmarksData}
          lastStep={lastStep}
        />

        {/* Patient Body Framing Silhouette Guide */}
        <SilhouetteGuide
          framing={framing || landmarksData?.quality?.framing}
          isDemoMode={isDemoMode}
          visible={showSilhouetteGuide}
        />
      </div>

      {/* Top Left Status Badges */}
      <div style={{
        position: 'absolute',
        top: '12px',
        left: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        zIndex: 10,
      }}>
        <div style={{
          backgroundColor: badge.bg,
          border: `1px solid ${badge.border}`,
          color: badge.text,
          padding: '4px 10px',
          borderRadius: '999px',
          fontSize: '11px',
          fontWeight: 800,
          letterSpacing: '0.04em',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <span style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            backgroundColor: badge.border,
            boxShadow: `0 0 8px ${badge.border}`,
          }} />
          {badge.label}
        </div>

        <div style={{
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          color: '#E2E8F0',
          padding: '4px 10px',
          borderRadius: '999px',
          fontSize: '11px',
          fontWeight: 700,
          backdropFilter: 'blur(8px)',
        }}>
          Confidence: {Math.round(confidence * 100)}%
        </div>
      </div>

      {/* Top Right Controls & Performance Badges */}
      <div style={{
        position: 'absolute',
        top: '12px',
        right: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        zIndex: 10,
      }}>
        {/* Silhouette Guide Toggle Button */}
        <button
          onClick={() => setShowSilhouetteGuide((prev) => !prev)}
          title="Toggle Patient Body Framing Silhouette Guide"
          style={{
            backgroundColor: showSilhouetteGuide ? 'rgba(13, 148, 136, 0.75)' : 'rgba(15, 23, 42, 0.75)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: '#FFFFFF',
            padding: '4px 10px',
            borderRadius: '6px',
            fontSize: '11px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            backdropFilter: 'blur(8px)',
            transition: 'all 0.15s ease',
          }}
        >
          {showSilhouetteGuide ? <Eye size={13} /> : <EyeOff size={13} />}
          <span>Guide: {showSilhouetteGuide ? 'ON' : 'OFF'}</span>
        </button>

        <div style={{
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          color: '#94A3B8',
          padding: '4px 8px',
          borderRadius: '6px',
          fontSize: '11px',
          fontWeight: 600,
          backdropFilter: 'blur(8px)',
        }}>
          {fps > 0 ? `${fps.toFixed(0)} FPS` : '-- FPS'}
        </div>
        <div style={{
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          color: '#94A3B8',
          padding: '4px 8px',
          borderRadius: '6px',
          fontSize: '11px',
          fontWeight: 600,
          backdropFilter: 'blur(8px)',
        }}>
          {latencyMs > 0 ? `${latencyMs.toFixed(0)}ms` : '-- ms'}
        </div>
      </div>

      {/* Bottom Step Indicator Bar */}
      <div style={{
        position: 'absolute',
        bottom: '12px',
        left: '12px',
        right: '12px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 10,
      }}>
        <div style={{
          padding: '6px 14px',
          borderRadius: '8px',
          backgroundColor: lastStep?.side === 'LEFT' ? 'rgba(59, 130, 246, 0.9)' : 'rgba(15, 23, 42, 0.65)',
          border: `1px solid ${lastStep?.side === 'LEFT' ? '#3B82F6' : 'rgba(255,255,255,0.1)'}`,
          color: '#FFFFFF',
          fontSize: '12px',
          fontWeight: 800,
          transform: lastStep?.side === 'LEFT' ? 'scale(1.08)' : 'scale(1)',
          transition: 'all 0.15s ease',
        }}>
          LEFT FOOT
        </div>

        <div style={{
          fontSize: '11px',
          color: '#94A3B8',
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          padding: '4px 10px',
          borderRadius: '6px',
          backdropFilter: 'blur(4px)',
        }}>
          MediaPipe Pose Landmarker FULL (33 Keypoints)
        </div>

        <div style={{
          padding: '6px 14px',
          borderRadius: '8px',
          backgroundColor: lastStep?.side === 'RIGHT' ? 'rgba(244, 63, 94, 0.9)' : 'rgba(15, 23, 42, 0.65)',
          border: `1px solid ${lastStep?.side === 'RIGHT' ? '#F43F5E' : 'rgba(255,255,255,0.1)'}`,
          color: '#FFFFFF',
          fontSize: '12px',
          fontWeight: 800,
          transform: lastStep?.side === 'RIGHT' ? 'scale(1.08)' : 'scale(1)',
          transition: 'all 0.15s ease',
        }}>
          RIGHT FOOT
        </div>
      </div>

      {/* Prominent Laptop Camera Not Connected / Disconnected Overlay */}
      {errorMessage && !isDemoMode && (
        <div style={{
          position: 'absolute',
          inset: '20px',
          backgroundColor: 'rgba(15, 23, 42, 0.94)',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          borderRadius: '12px',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          textAlign: 'center',
          zIndex: 25,
          color: '#FFFFFF',
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '12px',
          }}>
            <CameraOff size={26} color="#EF4444" />
          </div>

          <h4 style={{ margin: '0 0 6px 0', fontSize: '16px', fontWeight: 800, color: '#F87171' }}>
            Laptop Camera Access Required
          </h4>

          <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#94A3B8', maxWidth: '440px', lineHeight: '1.4' }}>
            {errorMessage || 'Please ensure camera access is allowed in your browser address bar.'}
          </p>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {onSwitchToDemo && (
              <button
                onClick={onSwitchToDemo}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  backgroundColor: '#0D9488',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '10px 18px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(13, 148, 136, 0.3)',
                  transition: 'transform 0.1s ease',
                }}
              >
                <Sparkles size={16} />
                Test with Demo Simulator
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

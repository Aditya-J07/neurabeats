import React from 'react';
import { Heart, Activity, User, Stethoscope, ShieldCheck, Sparkles } from 'lucide-react';

export default function Navbar({ activeView, setActiveView }) {
  return (
    <header style={{
      backgroundColor: 'rgba(255, 255, 255, 0.85)',
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid var(--border-soft)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      padding: '12px 24px'
    }}>
      <div style={{
        maxWidth: '1100px',
        margin: '0 auto',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        
        {/* Brand & Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #4A8C8C 0%, #5B9A8B 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(74, 140, 140, 0.3)'
          }}>
            <Activity size={24} color="#FFFFFF" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
                NeuroBeat
              </span>
              <span style={{
                backgroundColor: 'var(--bg-accent-soft)',
                color: 'var(--primary)',
                fontSize: '10px',
                fontWeight: 800,
                padding: '2px 7px',
                borderRadius: 'var(--radius-full)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em'
              }}>
                Agentic AI
              </span>
            </div>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block' }}>
              Adaptive Neurorehabilitation Companion
            </span>
          </div>
        </div>

        {/* View Switcher Toggle (Patient vs Clinician) */}
        <div style={{
          backgroundColor: 'var(--bg-subtle)',
          padding: '4px',
          borderRadius: 'var(--radius-full)',
          display: 'flex',
          border: '1px solid var(--border-soft)',
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <button
            onClick={() => setActiveView('patient')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 18px',
              borderRadius: 'var(--radius-full)',
              backgroundColor: activeView === 'patient' ? '#FFFFFF' : 'transparent',
              color: activeView === 'patient' ? 'var(--primary)' : 'var(--text-muted)',
              fontWeight: 700,
              fontSize: '13px',
              boxShadow: activeView === 'patient' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            <User size={15} />
            Patient Companion View
          </button>

          <button
            onClick={() => setActiveView('clinician')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 18px',
              borderRadius: 'var(--radius-full)',
              backgroundColor: activeView === 'clinician' ? '#FFFFFF' : 'transparent',
              color: activeView === 'clinician' ? 'var(--primary)' : 'var(--text-muted)',
              fontWeight: 700,
              fontSize: '13px',
              boxShadow: activeView === 'clinician' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            <Stethoscope size={15} />
            Clinician Safety Portal
          </button>
        </div>

        {/* On-Device Privacy Badge */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '12px',
          color: 'var(--text-muted)'
        }}>
          <ShieldCheck size={16} color="#3D9970" />
          <span>On-Device Sensing • Privacy First</span>
        </div>

      </div>
    </header>
  );
}

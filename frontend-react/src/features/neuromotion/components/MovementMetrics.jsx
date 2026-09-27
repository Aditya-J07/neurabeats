/**
 * MovementMetrics Component
 * Renders real-time cadence, step tallies, bilateral balance, and quality score.
 */

import React from 'react';
import { Activity, Gauge, Scale, Award } from 'lucide-react';

export default function MovementMetrics({
  cadenceSpm = '--',
  leftSteps = 0,
  rightSteps = 0,
  totalSteps = 0,
  balanceScore = 100,
  qualityScore = 85,
}) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
      gap: '12px',
      margin: '16px 0',
    }}>
      {/* Cadence Card */}
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '12px',
        padding: '14px',
        border: '1px solid #E2E8F0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748B', fontSize: '12px', fontWeight: 600 }}>
          <Gauge size={16} color="#0D9488" />
          <span>Cadence</span>
        </div>
        <div style={{ marginTop: '6px', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
          <span style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A' }}>
            {cadenceSpm}
          </span>
          <span style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 600 }}>SPM</span>
        </div>
      </div>

      {/* Step Counts Card */}
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '12px',
        padding: '14px',
        border: '1px solid #E2E8F0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748B', fontSize: '12px', fontWeight: 600 }}>
          <Activity size={16} color="#3B82F6" />
          <span>Steps (L / R)</span>
        </div>
        <div style={{ marginTop: '6px', display: 'flex', alignItems: 'baseline', gap: '6px' }}>
          <span style={{ fontSize: '20px', fontWeight: 800, color: '#3B82F6' }}>{leftSteps}</span>
          <span style={{ color: '#CBD5E1', fontWeight: 800 }}>/</span>
          <span style={{ fontSize: '20px', fontWeight: 800, color: '#F43F5E' }}>{rightSteps}</span>
          <span style={{ fontSize: '11px', color: '#94A3B8', marginLeft: 'auto' }}>Total: {totalSteps}</span>
        </div>
      </div>

      {/* Bilateral Balance Card */}
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '12px',
        padding: '14px',
        border: '1px solid #E2E8F0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748B', fontSize: '12px', fontWeight: 600 }}>
          <Scale size={16} color="#8B5CF6" />
          <span>Balance</span>
        </div>
        <div style={{ marginTop: '6px', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
          <span style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A' }}>
            {balanceScore}%
          </span>
          <span style={{ fontSize: '11px', color: '#10B981', fontWeight: 600 }}>Symmetry</span>
        </div>
      </div>

      {/* Movement Quality Card */}
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '12px',
        padding: '14px',
        border: '1px solid #E2E8F0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748B', fontSize: '12px', fontWeight: 600 }}>
          <Award size={16} color="#F59E0B" />
          <span>Movement Quality</span>
        </div>
        <div style={{ marginTop: '6px', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
          <span style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A' }}>
            {qualityScore}
          </span>
          <span style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 600 }}>/ 100</span>
        </div>
      </div>
    </div>
  );
}

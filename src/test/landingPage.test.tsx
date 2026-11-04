import React from 'react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import LandingPage from '../pages/LandingPage';

beforeAll(() => {
  class MockIntersectionObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  Object.defineProperty(window, 'IntersectionObserver', {
    writable: true,
    configurable: true,
    value: MockIntersectionObserver,
  });

  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    clearRect: vi.fn(),
    fillText: vi.fn(),
    font: '',
    fillStyle: '',
  })) as any;
});

describe('Phase 29: Landing Page Executive White Theme & Layout Tests', () => {

  describe('Static & Structural Analysis', () => {
    const landingPagePath = path.resolve(__dirname, '../pages/LandingPage.tsx');
    const content = fs.readFileSync(landingPagePath, 'utf8');

    it('Theme Foundation: strictly eliminates obsidian/dark root and adopts executive white slate-50 base', () => {
      expect(content).not.toContain('bg-[#090d16]');
      expect(content).toContain('bg-slate-50 text-slate-900');
      expect(content).toContain('bg-white');
      expect(content).toContain('border-slate-200');
    });

    it('Video Elimination: permanently removes broken finance-bg.mp4 video embed', () => {
      expect(content).not.toContain('./finance-bg.mp4');
      expect(content).not.toContain('<video');
    });

    it('Suite Coverage: accurately references all 8 statutory suites and Autonomous suite', () => {
      expect(content).toContain('Suite 01');
      expect(content).toContain('Suite 02');
      expect(content).toContain('Suite 03');
      expect(content).toContain('Suite 04');
      expect(content).toContain('Suite 05');
      expect(content).toContain('Suite 06');
      expect(content).toContain('Suite 07');
      expect(content).toContain('Suite 08');
      expect(content).toContain('Autonomous Suite');
    });

    it('Zero-Merge Architecture: documents strict ws[\'!merges\'] = [] architectural defense', () => {
      expect(content).toContain("ws['!merges'] = []");
      expect(content).toContain('Strict Zero-Merge Architecture');
    });

    it('Air-Gapped Local Execution: highlights 100% on-premise SQLite and Port 9000', () => {
      expect(content).toContain('100% Air-Gapped Local Execution');
      expect(content).toContain('Port 9000: Connected');
      expect(content).toContain('SQLite WAL');
    });

    it('Autonomous Suite: displays In-App AI Copilot capability', () => {
      expect(content).toContain('In-App AI Copilot');
      expect(content).toContain('Notice Shield AI');
    });
  });

  describe('DOM Component Rendering & User Interactions', () => {
    const mockOnNext = vi.fn();
    const mockSetFeedbackList = vi.fn();
    const initialFeedback = [
      { name: 'CA Arvind Gupta', rating: 5, message: 'Unbelievable speed on large reconciliations.', date: '28 Oct 2026' }
    ];

    it('renders hero title and trust badge cleanly', () => {
      render(
        <LandingPage
          onNext={mockOnNext}
          feedbackList={initialFeedback}
          setFeedbackList={mockSetFeedbackList}
        />
      );

      expect(screen.getByText(/Enterprise Statutory Audit/i)).toBeInTheDocument();
      expect(screen.getByText(/Industrial-Grade On-Premise CA Suite/i)).toBeInTheDocument();
      expect(screen.getAllByText(/AUDIT WITH VASWANI/i).length).toBeGreaterThan(0);
    });

    it('renders the 4 live KPI telemetry metrics', () => {
      render(
        <LandingPage
          onNext={mockOnNext}
          feedbackList={initialFeedback}
          setFeedbackList={mockSetFeedbackList}
        />
      );

      expect(screen.getByText('50,000+')).toBeInTheDocument();
      expect(screen.getByText('₹0.00')).toBeInTheDocument();
      expect(screen.getByText('8 + 1')).toBeInTheDocument();
      expect(screen.getByText('100%')).toBeInTheDocument();
    });

    it('invokes onNext when Get Started or Enter Practice Hub is clicked', () => {
      render(
        <LandingPage
          onNext={mockOnNext}
          feedbackList={initialFeedback}
          setFeedbackList={mockSetFeedbackList}
        />
      );

      const enterButtons = screen.getAllByRole('button', { name: /Enter Practice Hub|Get Started/i });
      expect(enterButtons.length).toBeGreaterThan(0);

      fireEvent.click(enterButtons[0]);
      expect(mockOnNext).toHaveBeenCalled();
    });

    it('filters suites when category filter tabs are clicked', () => {
      render(
        <LandingPage
          onNext={mockOnNext}
          feedbackList={initialFeedback}
          setFeedbackList={mockSetFeedbackList}
        />
      );

      // Click "Tally & Integration"
      const tallyFilterBtn = screen.getByRole('button', { name: /Tally & Integration/i });
      fireEvent.click(tallyFilterBtn);

      // Suite 03 should be present
      expect(screen.getByText(/Tally Prime Direct XML Integration/i)).toBeInTheDocument();

      // Click "All Suites"
      const allFilterBtn = screen.getByRole('button', { name: /All Suites/i });
      fireEvent.click(allFilterBtn);

      expect(screen.getByText(/GST Multi-Tier Reconciliation & Debit Note Solver/i)).toBeInTheDocument();
      expect(screen.getByText(/Monthly Audit Working Paper Verification Suite/i)).toBeInTheDocument();
    });

    it('opens and closes the feedback modal dialog', () => {
      render(
        <LandingPage
          onNext={mockOnNext}
          feedbackList={initialFeedback}
          setFeedbackList={mockSetFeedbackList}
        />
      );

      // Click Feedback in header
      const feedbackButtons = screen.getAllByRole('button', { name: /Feedback/i });
      fireEvent.click(feedbackButtons[0]);

      // Modal dialog should appear
      expect(screen.getByText(/Practitioner Feedback/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/e\.g\. CA Rajesh Sharma/i)).toBeInTheDocument();

      // Click close button
      const closeBtn = screen.getByRole('button', { name: /Close feedback modal/i });
      fireEvent.click(closeBtn);
    });

    it('switches tabs in the live interactive financial cockpit demo', () => {
      render(
        <LandingPage
          onNext={mockOnNext}
          feedbackList={initialFeedback}
          setFeedbackList={mockSetFeedbackList}
        />
      );

      // Default tab: ITC Waterfall Matcher
      expect(screen.getByText(/Matched ITC vs GSTR-2B/i)).toBeInTheDocument();

      // Click Tally Prime Bridge tab
      const tallyTabBtn = screen.getByRole('button', { name: /Tally Prime Bridge/i });
      fireEvent.click(tallyTabBtn);

      expect(screen.getByText(/Target Company:/i)).toBeInTheDocument();
      expect(screen.getByText(/DYP INFRAPROJECTS PVT LTD/i)).toBeInTheDocument();

      // Click 12M Autopilot Telemetry tab
      const autopilotTabBtn = screen.getByRole('button', { name: /12M Autopilot Telemetry/i });
      fireEvent.click(autopilotTabBtn);

      expect(screen.getByText(/12-Month GSTR-2B Sync Status/i)).toBeInTheDocument();
    });
  });
});

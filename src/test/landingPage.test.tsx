import React from 'react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import fs from 'fs';
import path from 'path';
import LandingPage from '../pages/LandingPage';
import { CORE_SUITES, WIP_MODULES } from '../data/landingModules';

beforeAll(() => {
  window.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

describe('Landing Page Presentation Architecture & DOM Tests', () => {
  describe('Static & Bloat Removal Checks', () => {
    const landingPagePath = path.resolve(__dirname, '../pages/LandingPage.tsx');
    const content = fs.readFileSync(landingPagePath, 'utf8');

    it('Theme Foundation: adopts executive light base and drops legacy dark root', () => {
      expect(content).not.toContain('bg-[#090d16]');
      expect(content).toContain('bg-[#FBFBFD]');
      expect(content).toContain('bg-white');
      expect(content).toContain('border-slate-200');
    });

    it('Bloat Removal: eliminates video embeds, cursor gimmicks, and developer telemetry clutter', () => {
      expect(content).not.toContain('./finance-bg.mp4');
      expect(content).not.toContain('<video');
      expect(content).not.toContain('CursorAura');
      expect(content).not.toContain('heroLatency');
      expect(content).not.toContain('JSON Payload');
      expect(content).not.toContain('liveActivities');
      expect(content).not.toContain('14 Engines');
    });

    it('Suite Alignment: covers Suites 01-07, Notices/AI, and Suite 08 WIP Roadmap', () => {
      expect(CORE_SUITES.map((s) => s.suiteCode)).toEqual([
        'Suite 01',
        'Suite 02',
        'Suite 03',
        'Suite 04',
        'Suite 05',
        'Suite 06',
        'Suite 07',
        'Notices & AI',
      ]);
      expect(WIP_MODULES.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('DOM Rendering & Interactive Presentation Controls', () => {
    it('renders simplified hero, headline figures, and end-to-end flow diagram', () => {
      const mockOnNext = vi.fn();
      render(
        <MemoryRouter>
          <LandingPage onNext={mockOnNext} />
        </MemoryRouter>
      );

      expect(screen.getByText(/Every GST, Tally & Audit Workflow/i)).toBeInTheDocument();
      expect(screen.getByText(/How the Entire Software Works/i)).toBeInTheDocument();
      expect(screen.getByText(/^8 Suites$/i)).toBeInTheDocument();
      expect(screen.getByText(/^1-Login 12M$/i)).toBeInTheDocument();
    });

    it('steps through modules with Next/Previous controls and renders per-suite visual widgets', () => {
      const mockOnNext = vi.fn();
      render(
        <MemoryRouter>
          <LandingPage onNext={mockOnNext} />
        </MemoryRouter>
      );

      // Starts on Suite 01 with Reco Breakdown Widget
      expect(screen.getByText(/Module 1 of 8/i)).toBeInTheDocument();
      expect(screen.getByTestId('visual-widget-reco')).toBeInTheDocument();

      // Advance to Suite 02 (Tally Connectors & XML Bridge)
      fireEvent.click(screen.getByRole('button', { name: /Next Suite/i }));
      expect(screen.getByText(/Module 2 of 8/i)).toBeInTheDocument();
      expect(screen.getByTestId('visual-widget-tally')).toBeInTheDocument();
      expect(screen.getByText(/DIRECT TALLY BRIDGE DIAGRAM/i)).toBeInTheDocument();

      // Jump directly to Suite 05 (Income Tax Optimizer) via selector pill
      fireEvent.click(screen.getAllByRole('button', { name: /Suite 05:/i })[0]);
      expect(screen.getByText(/Module 5 of 8/i)).toBeInTheDocument();
      expect(screen.getByTestId('visual-widget-tax')).toBeInTheDocument();

      // Go back one step to Suite 04 (Statutory & Tax Audit)
      fireEvent.click(screen.getByRole('button', { name: /Previous Suite/i }));
      expect(screen.getByText(/Module 4 of 8/i)).toBeInTheDocument();
      expect(screen.getByTestId('visual-widget-audit')).toBeInTheDocument();

      // Keyboard ArrowRight / ArrowLeft controls
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      expect(screen.getByText(/Module 5 of 8/i)).toBeInTheDocument();
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
      expect(screen.getByText(/Module 4 of 8/i)).toBeInTheDocument();
    }, 15000);

    it('switches audience role pitch and renders Before vs After + contact actions', () => {
      const mockOnNext = vi.fn();
      render(
        <MemoryRouter>
          <LandingPage onNext={mockOnNext} />
        </MemoryRouter>
      );

      expect(screen.getByText(/Before vs With AUDIT WITH VASWANI/i)).toBeInTheDocument();
      expect(screen.getByText(/Zero Staff Error/i)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Business Owners/i }));
      expect(screen.getByText(/Protect ITC, avoid vendor defaults/i)).toBeInTheDocument();
      expect(screen.getAllByRole('link', { name: /WhatsApp for Demo/i }).length).toBeGreaterThan(0);
    });

    it('renders Suite 08 WIP & Upcoming Future Updates section', () => {
      const mockOnNext = vi.fn();
      render(
        <MemoryRouter>
          <LandingPage onNext={mockOnNext} />
        </MemoryRouter>
      );

      expect(screen.getByText(/Expanding Modules & Future Roadmap/i)).toBeInTheDocument();
      expect(screen.getByText(/Practice Dashboard & Client Master/i)).toBeInTheDocument();
      expect(screen.getByText(/Bank CMA Credit & MPBF Ratios/i)).toBeInTheDocument();
      expect(screen.getByText(/GSTR-9 \/ 9C Annual Helper & More Formats/i)).toBeInTheDocument();
      expect(screen.getAllByText(/\+91 8989998663/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/sourav\.vaswani01@gmail\.com/i).length).toBeGreaterThan(0);
    });

    it('invokes onNext when Enter Software button is clicked', () => {
      const mockOnNext = vi.fn();
      render(
        <MemoryRouter>
          <LandingPage onNext={mockOnNext} />
        </MemoryRouter>
      );

      const enterButtons = screen.getAllByRole('button', { name: /Enter Software/i });
      expect(enterButtons.length).toBeGreaterThan(0);

      fireEvent.click(enterButtons[0]);
      expect(mockOnNext).toHaveBeenCalledTimes(1);
    });

    it('toggles theme cleanly between light and dark mode', () => {
      const mockOnNext = vi.fn();
      render(
        <MemoryRouter>
          <LandingPage onNext={mockOnNext} />
        </MemoryRouter>
      );

      const themeToggle = screen.getByRole('button', { name: /Toggle theme/i });
      fireEvent.click(themeToggle);
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      fireEvent.click(themeToggle);
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
  });
});

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HorizonPageLoader } from '@/components/ui/horizon-page-loader';
import Splash from '@/pages/Splash';

describe('HorizonPageLoader & Splash Component Tests', () => {
  it('renders HorizonPageLoader with default props', () => {
    render(<HorizonPageLoader eyebrow="Test Eyebrow" label="Test Label" />);
    expect(screen.getByText('Test Eyebrow')).toBeInTheDocument();
    expect(screen.getByText('Test Label')).toBeInTheDocument();
  });

  it('renders Splash screen with branding and HorizonPageLoader', () => {
    const handleComplete = vi.fn();
    render(<Splash onComplete={handleComplete} themeStyles="" />);
    expect(screen.getByText('AUDIT WITH VASWANI')).toBeInTheDocument();
    expect(screen.getByText('VASWANI ENTERPRISE ASSURANCE')).toBeInTheDocument();
    expect(screen.getByText('Skip Transition [ESC]')).toBeInTheDocument();
  });
});

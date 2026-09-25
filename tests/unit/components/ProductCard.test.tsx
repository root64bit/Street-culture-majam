import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ProductCard } from '@/components/ui/ProductCard';

describe('ProductCard component', () => {
  const mockProps = {
    id: 'test-1',
    name: "A/X Prototype Runner 'Acid Void'",
    slug: 'ax-prototype-runner-acid-void',
    brandName: 'OFF-WHITE',
    price: 2840,
    currency: 'USD',
    condition: 'NEW / UNWORN',
    specimenNumber: '9084',
    size: 'US 10.5',
  };

  it('renders product details correctly', () => {
    render(<ProductCard {...mockProps} />);
    expect(screen.getByText("A/X Prototype Runner 'Acid Void'")).toBeInTheDocument();
    expect(screen.getByText('OFF-WHITE')).toBeInTheDocument();
    expect(screen.getByText('$2,840')).toBeInTheDocument();
    expect(screen.getByText('SPECIMEN #9084')).toBeInTheDocument();
    expect(screen.getByText('US 10.5')).toBeInTheDocument();
    expect(screen.getByText('NEW / UNWORN')).toBeInTheDocument();
  });

  it('links to the product detail page', () => {
    render(<ProductCard {...mockProps} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/products/ax-prototype-runner-acid-void');
  });
});

'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calculator, DollarSign, TrendingUp, Phone } from 'lucide-react';
import Link from 'next/link';
import CallTrackingWrapper from '@/components/CallTrackingWrapper';

const LOAN_TERMS = [
  { value: '5', label: '5 Years (60 months)' },
  { value: '7', label: '7 Years (84 months)' },
  { value: '10', label: '10 Years (120 months)' },
  { value: '15', label: '15 Years (180 months)' },
];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCurrencyExact(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export default function FinancingCalculator() {
  const [projectCost, setProjectCost] = useState<string>('50000');
  const [downPayment, setDownPayment] = useState<string>('5000');
  const [interestRate, setInterestRate] = useState<string>('7.99');
  const [loanTerm, setLoanTerm] = useState<string>('10');

  const results = useMemo(() => {
    const cost = parseFloat(projectCost) || 0;
    const down = parseFloat(downPayment) || 0;
    const rate = parseFloat(interestRate) || 0;
    const years = parseInt(loanTerm) || 10;

    const principal = Math.max(cost - down, 0);
    const monthlyRate = rate / 100 / 12;
    const numPayments = years * 12;

    if (principal <= 0 || rate <= 0) {
      return {
        monthlyPayment: 0,
        totalInterest: 0,
        totalCost: down,
        principal: 0,
      };
    }

    // Standard amortization formula: M = P[r(1+r)^n] / [(1+r)^n - 1]
    const monthlyPayment =
      (principal * (monthlyRate * Math.pow(1 + monthlyRate, numPayments))) /
      (Math.pow(1 + monthlyRate, numPayments) - 1);

    const totalPaid = monthlyPayment * numPayments;
    const totalInterest = totalPaid - principal;
    const totalCost = totalPaid + down;

    return {
      monthlyPayment: isFinite(monthlyPayment) ? monthlyPayment : 0,
      totalInterest: isFinite(totalInterest) ? totalInterest : 0,
      totalCost: isFinite(totalCost) ? totalCost : 0,
      principal,
    };
  }, [projectCost, downPayment, interestRate, loanTerm]);

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-primary/10 w-12 h-12 rounded-full flex items-center justify-center">
            <Calculator className="h-6 w-6 text-primary" />
          </div>
          <div>
            <CardTitle className="text-2xl">Financing Calculator</CardTitle>
            <CardDescription>Estimate your monthly payments</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Inputs */}
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="projectCost">Project Cost</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                <Input
                  id="projectCost"
                  type="number"
                  min="0"
                  step="1000"
                  value={projectCost}
                  onChange={(e) => setProjectCost(e.target.value)}
                  className="pl-9"
                  placeholder="50000"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="downPayment">Down Payment</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                <Input
                  id="downPayment"
                  type="number"
                  min="0"
                  step="500"
                  value={downPayment}
                  onChange={(e) => setDownPayment(e.target.value)}
                  className="pl-9"
                  placeholder="5000"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="interestRate">Interest Rate (%)</Label>
              <div className="relative">
                <TrendingUp className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                <Input
                  id="interestRate"
                  type="number"
                  min="0"
                  max="30"
                  step="0.01"
                  value={interestRate}
                  onChange={(e) => setInterestRate(e.target.value)}
                  className="pl-9"
                  placeholder="7.99"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="loanTerm">Loan Term</Label>
              <Select value={loanTerm} onValueChange={setLoanTerm}>
                <SelectTrigger id="loanTerm">
                  <SelectValue placeholder="Select loan term" />
                </SelectTrigger>
                <SelectContent>
                  {LOAN_TERMS.map((term) => (
                    <SelectItem key={term.value} value={term.value}>
                      {term.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Results */}
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-primary/5 to-accent-sunset/5 rounded-xl p-6 text-center">
              <p className="text-sm text-text-muted mb-1 uppercase tracking-wider">Estimated Monthly Payment</p>
              <p className="text-4xl md:text-5xl font-bold text-primary">
                {formatCurrencyExact(results.monthlyPayment)}
              </p>
              <p className="text-sm text-text-muted mt-2">per month</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-muted/50 rounded-lg p-4 text-center">
                <p className="text-xs text-text-muted mb-1">Loan Amount</p>
                <p className="text-lg font-semibold text-text-primary">
                  {formatCurrency(results.principal)}
                </p>
              </div>
              <div className="bg-muted/50 rounded-lg p-4 text-center">
                <p className="text-xs text-text-muted mb-1">Total Interest</p>
                <p className="text-lg font-semibold text-text-primary">
                  {formatCurrency(results.totalInterest)}
                </p>
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-4 text-center">
              <p className="text-xs text-text-muted mb-1">Total Cost (including down payment)</p>
              <p className="text-xl font-bold text-text-primary">
                {formatCurrency(results.totalCost)}
              </p>
            </div>

            <p className="text-xs text-text-muted text-center">
              * This calculator provides estimates only. Actual rates and terms may vary.
              Contact us for personalized financing options.
            </p>

            {/* CTA */}
            <div className="bg-secondary/5 rounded-xl p-6 text-center space-y-3">
              <p className="text-text-primary font-semibold">Ready to get started?</p>
              <p className="text-sm text-text-secondary">
                Get a free, no-obligation estimate for your project.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button asChild className="bg-gradient-to-r from-primary via-accent-sunset to-accent-tangerine bg-[length:400%_100%] animate-gradient hover:shadow-button">
                  <Link href="/contact">Get Free Estimate</Link>
                </Button>
                <CallTrackingWrapper
                  href="tel:2012124917"
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
                >
                  <Phone className="h-4 w-4" />
                  (201) 212-4917
                </CallTrackingWrapper>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

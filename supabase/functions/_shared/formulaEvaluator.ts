/**
 * Safely evaluates mathematical formulas with given variables
 * Used for calculating material quantities based on project dimensions
 */
export function evaluateFormula(formula: string, variables: Record<string, number>): number {
  try {
    // Replace variable names with their values
    let expression = formula;

    for (const [key, value] of Object.entries(variables)) {
      // Replace all occurrences of the variable with its value
      const regex = new RegExp(`\\b${key}\\b`, 'g');
      expression = expression.replace(regex, value.toString());
    }

    // Use Function constructor to safely evaluate the expression
    // Only allow basic math operations
    const allowedChars = /^[0-9+\-*/(). ]+$/;
    if (!allowedChars.test(expression)) {
      console.warn('Invalid characters in formula:', expression);
      return 0;
    }

    // Evaluate the expression
    const result = Function(`"use strict"; return (${expression})`)();

    return typeof result === 'number' && !isNaN(result) ? result : 0;
  } catch (error) {
    console.error('Error evaluating formula:', formula, error);
    return 0;
  }
}

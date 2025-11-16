import { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface CalculatorLayoutProps {
  children: ReactNode;
  title: string;
  description?: string;
}

export const CalculatorLayout = ({ children, title, description }: CalculatorLayoutProps) => {
  return (
    <div className="min-h-screen bg-background py-12">
      <div className="container mx-auto px-4 max-w-4xl">
        <Card className="shadow-elegant">
          <CardHeader className="space-y-3">
            <CardTitle className="text-3xl font-bold text-center">{title}</CardTitle>
            {description && (
              <CardDescription className="text-center text-lg">
                {description}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </div>
    </div>
  );
};

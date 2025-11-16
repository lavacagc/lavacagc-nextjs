'use client'

import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useProjectTypes } from "@/hooks/useProjectTypes";
import { Loader2, Calculator, Wrench, Home, Plus } from "lucide-react";

const projectIcons = {
  bathroom: Wrench,
  kitchen: Calculator,
  living_space: Home,
  home_addition: Plus,
};

export const ProjectTypeSelector = () => {
  const router = useRouter();
  const { data: projectTypes, isLoading } = useProjectTypes();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold">Project Cost Calculator</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Get an instant estimate for your home renovation project. Select your project type below to get started.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {projectTypes?.map((projectType) => {
          const Icon = projectIcons[projectType.name as keyof typeof projectIcons];
          
          return (
            <Card
              key={projectType.id}
              className="group hover:shadow-elegant transition-all duration-300 hover:-translate-y-1 cursor-pointer border-2 hover:border-primary/20"
              onClick={() => router.push(`/project-calculator/${projectType.name}`)}
            >
              <CardHeader className="space-y-4">
                <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors mx-auto">
                  {Icon && <Icon className="h-8 w-8 text-primary" />}
                </div>
                <CardTitle className="text-center text-xl">
                  {projectType.display_name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <CardDescription className="text-center">
                  {projectType.requires_pdf_upload
                    ? "Upload your plans for a custom estimate within 24-48 hours"
                    : `Get an instant estimate based on your square footage and preferences`}
                </CardDescription>

                <Button className="w-full group-hover:shadow-glow" size="lg">
                  {projectType.requires_pdf_upload ? "Upload Plans" : "Calculate Estimate"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

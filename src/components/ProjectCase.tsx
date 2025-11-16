'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, DollarSign, Clock, Users } from "lucide-react";
import ProjectImageGallery from "./ProjectImageGallery";
import TestimonialCard from "./TestimonialCard";
import { useRouter } from "next/navigation";

interface ProjectCaseProps {
  title: string;
  location: string;
  projectType: string;
  completionDate: string;
  duration: string;
  squareFootage?: number;
  budget: {
    range: string;
    breakdown?: {
      category: string;
      amount: string;
    }[];
  };
  description: string;
  challenges: string[];
  solutions: string[];
  features: string[];
  beforeAfterImages: {
    before: string;
    after: string;
    caption: string;
  }[];
  testimonial?: {
    name: string;
    location: string;
    projectType: string;
    rating: number;
    testimonial: string;
    date: string;
    imageUrl?: string;
  };
  teamSize: number;
}

const ProjectCase = ({
  title,
  location,
  projectType,
  completionDate,
  duration,
  squareFootage,
  budget,
  description,
  challenges,
  solutions,
  features,
  beforeAfterImages,
  testimonial,
  teamSize
}: ProjectCaseProps) => {
  const router = useRouter();

  const handleGetQuote = () => {
    router.push('/');
    setTimeout(() => {
      const element = document.getElementById('estimate');
      if (element) {
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    }, 100);
  };

  return (
    <div className="space-y-8">
      {/* Project Header */}
      <Card>
        <CardHeader>
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <CardTitle className="text-3xl font-bold text-text-primary mb-2">
                {title}
              </CardTitle>
              <div className="flex flex-wrap items-center gap-4 text-text-secondary">
                <span className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  {location}
                </span>
                <Badge variant="secondary">{projectType}</Badge>
              </div>
            </div>
            <Button
              onClick={handleGetQuote}
              className="bg-gradient-to-r from-primary to-accent-tangerine"
            >
              Get Similar Quote
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {/* Project Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <div className="text-center p-4 bg-muted rounded-lg">
              <Calendar className="h-6 w-6 text-primary mx-auto mb-2" />
              <p className="text-sm text-text-secondary">Completed</p>
              <p className="font-semibold text-text-primary">{completionDate}</p>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <Clock className="h-6 w-6 text-primary mx-auto mb-2" />
              <p className="text-sm text-text-secondary">Duration</p>
              <p className="font-semibold text-text-primary">{duration}</p>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <DollarSign className="h-6 w-6 text-primary mx-auto mb-2" />
              <p className="text-sm text-text-secondary">Budget</p>
              <p className="font-semibold text-text-primary">{budget.range}</p>
            </div>
            {squareFootage && (
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="h-6 w-6 text-primary mx-auto mb-2 flex items-center justify-center font-bold">
                  ft&sup2;
                </div>
                <p className="text-sm text-text-secondary">Area</p>
                <p className="font-semibold text-text-primary">{squareFootage.toLocaleString()} ft&sup2;</p>
              </div>
            )}
            <div className="text-center p-4 bg-muted rounded-lg">
              <Users className="h-6 w-6 text-primary mx-auto mb-2" />
              <p className="text-sm text-text-secondary">Team Size</p>
              <p className="font-semibold text-text-primary">{teamSize} people</p>
            </div>
          </div>

          {/* Project Description */}
          <div className="prose max-w-none">
            <p className="text-text-secondary leading-relaxed">{description}</p>
          </div>
        </CardContent>
      </Card>

      {/* Project Image Gallery */}
      <ProjectImageGallery
        images={beforeAfterImages}
        title="Project Transformation"
      />

      {/* Project Details Grid */}
      <div className="grid lg:grid-cols-2 gap-8">
        {/* Challenges & Solutions */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl text-text-primary">Challenges</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {challenges.map((challenge, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0" />
                    <span className="text-text-secondary">{challenge}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl text-text-primary">Our Solutions</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {solutions.map((solution, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0" />
                    <span className="text-text-secondary">{solution}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Features & Budget */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl text-text-primary">Key Features</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {features.map((feature, index) => (
                  <Badge key={index} variant="outline" className="mb-2">
                    {feature}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {budget.breakdown && (
            <Card>
              <CardHeader>
                <CardTitle className="text-xl text-text-primary">Budget Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {budget.breakdown.map((item, index) => (
                    <div key={index} className="flex justify-between items-center">
                      <span className="text-text-secondary">{item.category}</span>
                      <span className="font-semibold text-text-primary">{item.amount}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Client Testimonial */}
      {testimonial && (
        <div>
          <h3 className="text-2xl font-bold text-text-primary text-center mb-6">
            What Our Client Says
          </h3>
          <div className="max-w-2xl mx-auto">
            <TestimonialCard {...testimonial} />
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectCase;

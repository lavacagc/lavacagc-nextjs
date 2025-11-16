import { Card, CardContent } from "@/components/ui/card";
import { Star, Quote } from "lucide-react";

interface TestimonialCardProps {
  name: string;
  location: string;
  projectType: string;
  rating: number;
  testimonial: string;
  date: string;
  imageUrl?: string;
}

const TestimonialCard = ({
  name,
  location,
  projectType,
  rating,
  testimonial,
  date,
  imageUrl
}: TestimonialCardProps) => {
  return (
    <Card className="h-full hover:shadow-elegant transition-all duration-300 relative overflow-hidden">
      <div className="absolute top-4 right-4 text-primary/20">
        <Quote className="h-8 w-8" />
      </div>

      <CardContent className="p-6">
        {/* Rating */}
        <div className="flex items-center gap-1 mb-4">
          {[...Array(5)].map((_, index) => (
            <Star
              key={index}
              className={`h-5 w-5 ${
                index < rating
                  ? 'text-yellow-400 fill-yellow-400'
                  : 'text-gray-300'
              }`}
            />
          ))}
          <span className="ml-2 text-sm text-text-secondary">({rating}/5)</span>
        </div>

        {/* Testimonial */}
        <blockquote className="text-text-secondary leading-relaxed mb-6 italic">
          "{testimonial}"
        </blockquote>

        {/* Client Info */}
        <div className="flex items-center gap-4">
          <div className="flex-shrink-0">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={`${name} from ${location} - La Vaca General Contractors client`}
                className="w-12 h-12 rounded-full object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gradient-primary flex items-center justify-center text-white font-semibold">
                {name.split(' ').map(n => n[0]).join('')}
              </div>
            )}
          </div>

          <div className="flex-1">
            <h4 className="font-semibold text-text-primary">{name}</h4>
            <p className="text-sm text-text-secondary">{location}</p>
            <p className="text-sm text-primary font-medium">{projectType}</p>
          </div>
        </div>

        {/* Date */}
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-text-secondary">{date}</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default TestimonialCard;

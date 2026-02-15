import Image, { StaticImageData } from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Mail, Phone, Calendar } from "lucide-react";

interface TeamMemberProps {
  name: string;
  role: string;
  bio: string;
  experience?: string;
  email?: string;
  phone?: string;
  imageUrl?: string | StaticImageData;
  priority?: boolean;
}

const TeamMember = ({
  name,
  role,
  bio,
  experience,
  email,
  phone,
  imageUrl,
  priority = false
}: TeamMemberProps) => {
  return (
    <Card className="overflow-hidden hover:shadow-elegant transition-all duration-300">
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Profile Image */}
          <div className="flex-shrink-0">
            <div className="w-32 h-32 rounded-full bg-gradient-primary overflow-hidden relative">
              {imageUrl ? (
                <Image
                  src={imageUrl}
                  alt={`${name} - ${role} at La Vaca General Contractors`}
                  width={128}
                  height={128}
                  className="w-full h-full object-cover"
                  priority={priority}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white font-bold text-2xl">
                  {name.split(' ').map(n => n[0]).join('')}
                </div>
              )}
            </div>
          </div>

          {/* Member Info */}
          <div className="flex-1">
            <div className="mb-4">
              <h3 className="text-xl font-bold text-text-primary mb-1">{name}</h3>
              <p className="text-lg text-primary font-semibold mb-2">{role}</p>
              {experience && (
                <div className="flex items-center gap-2 text-text-secondary mb-3">
                  <Calendar className="h-4 w-4" />
                  <span className="text-sm">{experience}</span>
                </div>
              )}
            </div>

            <p className="text-text-secondary mb-4 leading-relaxed">{bio}</p>

            {/* Contact Info */}
            <div className="flex flex-col sm:flex-row gap-3">
              {email && (
                <a 
                  href={`mailto:${email}`}
                  className="flex items-center gap-2 text-sm text-text-secondary hover:text-primary transition-colors"
                >
                  <Mail className="h-4 w-4" />
                  {email}
                </a>
              )}
              {phone && (
                <a 
                  href={`tel:${phone}`}
                  className="flex items-center gap-2 text-sm text-text-secondary hover:text-primary transition-colors"
                >
                  <Phone className="h-4 w-4" />
                  {phone}
                </a>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default TeamMember;
import type { Metadata } from 'next'
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Breadcrumb from "@/components/Breadcrumb";
import TeamMember from "@/components/TeamMember";
import { ComplianceDocuments } from "@/components/ComplianceDocuments";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Award, Users, Calendar, CheckCircle, Heart } from "lucide-react";
import alexHeadshot from "@/assets/alex-headshot.png";
import veronicaHeadshot from "@/assets/veronica-headshot.jpg";

export const metadata: Metadata = {
  title: "About La Vaca General Contractors - Our Story & Team | Northern NJ",
  description: "Learn about La Vaca General Contractors' story, meet our expert team, and discover our commitment to quality home remodeling in Northern New Jersey.",
  openGraph: {
    title: "About La Vaca General Contractors - Our Story & Team | Northern NJ",
    description: "Learn about La Vaca General Contractors' story, meet our expert team, and discover our commitment to quality home remodeling in Northern New Jersey.",
    url: "https://www.lavacagc.com/about",
  },
  alternates: {
    canonical: "https://www.lavacagc.com/about",
  },
}

export default function About() {
  const teamMembers = [
    {
      name: "Alex Tejena",
      role: "President & Chief Technology Officer",
      bio: "Alex leads La Vaca General Contractors with a strategic vision for innovation and excellence in home remodeling. As President and Chief Technology Officer, he combines his extensive construction expertise with cutting-edge technology solutions and manages client relations to deliver exceptional results for every project.",
      email: "alex@lavacagc.com",
      phone: "(201) 212-4917",
      imageUrl: alexHeadshot
    },
    {
      name: "Veronica Gerez",
      role: "Chief Operations Officer",
      bio: "Veronica oversees all operational aspects of La Vaca General Contractors, ensuring seamless project execution and exceptional client experiences. As Chief Operations Officer, she manages day-to-day operations and quality control while maintaining the company's high standards of service.",
      email: "veronica@lavacagc.com",
      phone: "(201) 212-4917",
      imageUrl: veronicaHeadshot
    }
  ];

  const companyStats = [
    {
      icon: Calendar,
      label: "Combined Experience",
      value: "20+ Years"
    },
    {
      icon: Users,
      label: "Happy Clients",
      value: "30+"
    },
    {
      icon: Award,
      label: "5-Star Reviews",
      value: "100%"
    }
  ];

  const values = [
    {
      icon: Heart,
      title: "Family-Owned Values",
      description: "As a family business, we treat every client like family and every home like our own."
    },
    {
      icon: Shield,
      title: "Quality Craftsmanship",
      description: "We use only the finest materials and employ skilled craftsmen who take pride in their work."
    },
    {
      icon: CheckCircle,
      title: "Transparent Process",
      description: "Clear communication, detailed estimates, and regular updates keep you informed every step of the way."
    }
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        {/* Breadcrumb Navigation */}
        <section className="bg-background-subtle py-4">
          <div className="container mx-auto px-4">
            <Breadcrumb />
          </div>
        </section>

        {/* Hero Section */}
        <section className="py-8 md:py-16 bg-gradient-subtle">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              <h1 className="text-4xl md:text-5xl font-bold text-text-primary mb-6">
                About La Vaca General Contractors
              </h1>
              <p className="text-xl text-text-secondary leading-relaxed mb-8">
                A family-owned business dedicated to transforming Northern New Jersey homes
                with exceptional craftsmanship, personalized service, and unwavering integrity.
              </p>
            </div>
          </div>
        </section>

        {/* Company Stats */}
        <section className="py-8 md:py-16 bg-background-subtle">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto">
              {companyStats.map((stat, index) => (
                <div key={index} className="text-center">
                  <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <stat.icon className="h-8 w-8 text-primary" />
                  </div>
                  <div className="text-3xl font-bold text-text-primary mb-2">{stat.value}</div>
                  <div className="text-text-secondary">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Our Story */}
        <section className="py-8 md:py-16 bg-muted/50">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-3xl font-bold text-text-primary text-center mb-12">
                Our Story
              </h2>

              <Card>
                <CardContent className="p-8">
                  <div className="prose max-w-none">
                    <p className="text-text-secondary text-lg leading-relaxed mb-6">
                      La Vaca General Contractors was founded in 2024 with a simple mission: to provide Northern New Jersey homeowners with exceptional remodeling services that combine quality craftsmanship with personalized attention.
                    </p>

                    <p className="text-text-secondary text-lg leading-relaxed mb-6">
                      What started as a small family business has grown into one of the region&apos;s most trusted remodeling companies. We&apos;ve completed projects all over north jersey, from intimate bathroom renovations to extensive whole-home transformations, always maintaining our commitment to excellence and client satisfaction.
                    </p>

                    <p className="text-text-secondary text-lg leading-relaxed mb-6">
                      Our boutique approach means we take on a limited number of projects at a time,
                      ensuring each client receives the dedicated attention they deserve. We believe
                      that your home is your sanctuary, and we&apos;re honored to help you create spaces
                      that reflect your style and enhance your daily life.
                    </p>

                    <p className="text-text-secondary text-lg leading-relaxed">
                      Today, we continue to serve families throughout Alpine, Short Hills, Saddle River,
                      Essex Fells, and surrounding communities, building lasting relationships one
                      project at a time.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Our Values */}
        <section className="py-8 md:py-16 bg-background-subtle">
          <div className="container mx-auto px-4">
            <div className="max-w-6xl mx-auto">
              <h2 className="text-3xl font-bold text-text-primary text-center mb-12">
                Our Values
              </h2>

              <div className="grid md:grid-cols-3 gap-8">
                {values.map((value, index) => (
                  // No hover effect: these cards are pure content, not links
                  // — see TeamMember.tsx for the same dead-click fix.
                  <Card key={index} className="text-center">
                    <CardContent className="p-8">
                      <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                        <value.icon className="h-8 w-8 text-primary" />
                      </div>
                      <h3 className="text-xl font-bold text-text-primary mb-4">{value.title}</h3>
                      <p className="text-text-secondary leading-relaxed">{value.description}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Meet Our Team */}
        <section className="py-8 md:py-16 bg-muted/50">
          <div className="container mx-auto px-4">
            <div className="max-w-6xl mx-auto">
              <h2 className="text-3xl font-bold text-text-primary text-center mb-12">
                Meet Our Team
              </h2>

              <div className="space-y-8">
                {teamMembers.map((member, index) => (
                  <TeamMember key={index} {...member} priority={index === 0} />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Licensing & Insurance */}
        <section id="credentials" className="py-8 md:py-16 bg-background-soft scroll-mt-24">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-3xl font-bold text-text-primary text-center mb-12">
                Licensed, Bonded & Insured
              </h2>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 justify-center">
                    <Shield className="h-6 w-6 text-primary" />
                    Your Peace of Mind is Our Priority
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  <div className="grid md:grid-cols-3 gap-8 mb-8">
                    <div>
                      <h3 className="font-bold text-text-primary mb-2">Licensed</h3>
                      <p className="text-text-secondary">New Jersey Home Improvement Contractor</p>
                      <p className="font-semibold text-primary">HIC# 13VH13373800</p>
                    </div>
                    <div>
                      <h3 className="font-bold text-text-primary mb-2">Bonded</h3>
                      <p className="text-text-secondary">Bonded for your financial protection</p>
                      <p className="font-semibold text-primary">$500,000 Bond</p>
                    </div>
                    <div>
                      <h3 className="font-bold text-text-primary mb-2">Insured</h3>
                      <p className="text-text-secondary">Comprehensive liability coverage</p>
                      <p className="font-semibold text-primary">$2M Coverage</p>
                    </div>
                  </div>

                  <p className="text-text-secondary leading-relaxed">
                    We maintain all required licensing, bonding, and insurance to protect both
                    your property and our team throughout every project.
                  </p>

                  <ComplianceDocuments />
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

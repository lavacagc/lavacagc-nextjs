import React from "react";
import { Phone, Mail, Facebook, Instagram } from "lucide-react";
import logo from "@/assets/logo.png";
import Link from "next/link";
import Image from "next/image";
import CallTrackingWrapper from "@/components/CallTrackingWrapper";

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-secondary text-secondary-foreground">
      <div className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-8 lg:gap-6">
          {/* Company Info with NAP */}
          <div className="sm:col-span-2 lg:col-span-3">
            <div className="flex items-center space-x-2 md:space-x-3 mb-6">
              <Image src={logo} alt="La Vaca General Contractors" className="h-6 md:h-12 w-auto" />
              <div>
                <span className="font-bold text-base md:text-xl block">La Vaca General Contractors, LLC</span>
                <p className="text-xs md:text-sm text-secondary-foreground/90">Premium Home Remodeling</p>
              </div>
            </div>
            <p className="text-lg mb-6 text-secondary-foreground/90 max-w-md">
              Boutique contractor specializing in high-end residential transformations with personalized service and meticulous craftsmanship.
            </p>

            {/* NAP Information */}
            <div className="space-y-3 mb-6">
              <CallTrackingWrapper href="tel:2012124917" className="flex items-center hover:text-primary transition-colors">
                <Phone className="h-5 w-5 mr-3 text-primary" />
                <span className="font-semibold">(201) 212-4917</span>
              </CallTrackingWrapper>
              <a href="mailto:info@lavacagc.com" className="flex items-center hover:text-primary transition-colors">
                <Mail className="h-5 w-5 mr-3 text-primary" />
                <span>info@lavacagc.com</span>
              </a>
            </div>
          </div>

          {/* Company Pages */}
          <div>
            <h4 className="font-bold text-lg mb-6">Company</h4>
            <ul className="space-y-3 text-sm text-secondary-foreground">
              <li><Link href="/about" className="hover:text-primary transition-colors">About Us</Link></li>
              <li><Link href="/process" className="hover:text-primary transition-colors">Our Process</Link></li>
              <li><Link href="/portfolio" className="hover:text-primary transition-colors">Portfolio</Link></li>
              <li><Link href="/reviews" className="hover:text-primary transition-colors">Reviews</Link></li>
              <li><Link href="/faq" className="hover:text-primary transition-colors">FAQ</Link></li>
              <li><Link href="/warranty" className="hover:text-primary transition-colors">Warranty Claims</Link></li>
              <li><Link href="/resources" className="hover:text-primary transition-colors">Resources</Link></li>
              <li><Link href="/referral" className="hover:text-primary transition-colors">Referral Program</Link></li>
            </ul>
          </div>

          {/* Services */}
          <div>
            <h4 className="font-bold text-lg mb-6">Our Services</h4>
            <ul className="space-y-3 text-sm text-secondary-foreground">
              <li><Link href="/services/kitchen-remodeling" className="hover:text-primary transition-colors">Kitchen Remodeling</Link></li>
              <li><Link href="/services/bathroom-renovation" className="hover:text-primary transition-colors">Bathroom Renovations</Link></li>
              <li><Link href="/services/basement-finishing" className="hover:text-primary transition-colors">Basement Finishing</Link></li>
              <li><Link href="/services/home-additions" className="hover:text-primary transition-colors">Home Additions</Link></li>
              <li><Link href="/services/interior-finishing" className="hover:text-primary transition-colors">Interior Finishing</Link></li>
            </ul>
          </div>

          {/* Service Areas */}
          <div className="sm:col-span-2">
            <h4 className="font-bold text-lg mb-6">Service Areas</h4>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-secondary-foreground">
              <li><Link href="/locations/alpine" className="hover:text-primary transition-colors">Alpine, NJ</Link></li>
              <li><Link href="/locations/bloomfield" className="hover:text-primary transition-colors">Bloomfield, NJ</Link></li>
              <li><Link href="/locations/caldwell" className="hover:text-primary transition-colors">Caldwell, NJ</Link></li>
              <li><Link href="/locations/clifton" className="hover:text-primary transition-colors">Clifton, NJ</Link></li>
              <li><Link href="/locations/essex-fells" className="hover:text-primary transition-colors">Essex Fells, NJ</Link></li>
              <li><Link href="/locations/ho-ho-kus" className="hover:text-primary transition-colors">Ho-Ho-Kus, NJ</Link></li>
              <li><Link href="/locations/livingston" className="hover:text-primary transition-colors">Livingston, NJ</Link></li>
              <li><Link href="/locations/madison" className="hover:text-primary transition-colors">Madison, NJ</Link></li>
              <li><Link href="/locations/maplewood" className="hover:text-primary transition-colors">Maplewood, NJ</Link></li>
              <li><Link href="/locations/millburn" className="hover:text-primary transition-colors">Millburn, NJ</Link></li>
              <li><Link href="/locations/montclair" className="hover:text-primary transition-colors">Montclair, NJ</Link></li>
              <li><Link href="/locations/morristown" className="hover:text-primary transition-colors">Morristown, NJ</Link></li>
              <li><Link href="/locations/parsippany" className="hover:text-primary transition-colors">Parsippany, NJ</Link></li>
              <li><Link href="/locations/saddle-river" className="hover:text-primary transition-colors">Saddle River, NJ</Link></li>
              <li><Link href="/locations/short-hills" className="hover:text-primary transition-colors">Short Hills, NJ</Link></li>
              <li><Link href="/locations/verona" className="hover:text-primary transition-colors">Verona, NJ</Link></li>
              <li><Link href="/locations/west-caldwell" className="hover:text-primary transition-colors">West Caldwell, NJ</Link></li>
              <li><Link href="/locations/west-orange" className="hover:text-primary transition-colors">West Orange, NJ</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="border-t border-secondary-foreground/20 mt-12 pt-8">
          <div className="flex flex-col md:flex-row items-center justify-between">
            <div className="text-sm text-secondary-foreground/80 mb-4 md:mb-0">
              <p>&copy; {currentYear} La Vaca General Contractors, LLC. All rights reserved.</p>
              <p className="mt-1">Licensed, Bonded, & Insured | HIC# 13VH13373800</p>
              <p className="mt-2">
                <Link href="/privacy-policy" className="hover:text-primary transition-colors">Privacy Policy</Link>
                {" | "}
                <Link href="/terms-and-conditions" className="hover:text-primary transition-colors">Terms & Conditions</Link>
                {" | "}
                <Link href="/do-not-sell" className="hover:text-primary transition-colors">Do Not Sell My Info</Link>
                {" | "}
                <Link href="/data-rights" className="hover:text-primary transition-colors">Your Data Rights</Link>
              </p>
            </div>

            <div className="flex items-center space-x-4">
              <span className="text-sm text-secondary-foreground/80 mr-4">Follow Us:</span>
              <a
                href="https://www.facebook.com/p/La-Vaca-General-Contractor-61563600601660/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors"
                aria-label="Visit our Facebook page"
              >
                <Facebook className="h-5 w-5" />
                <span className="sr-only">Facebook</span>
              </a>
              <a
                href="https://www.instagram.com/lavacagc/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors"
                aria-label="Follow us on Instagram"
              >
                <Instagram className="h-5 w-5" />
                <span className="sr-only">Instagram</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

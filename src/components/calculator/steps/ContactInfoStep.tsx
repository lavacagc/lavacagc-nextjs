import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, Mail, Phone, MapPin, Home } from "lucide-react";

const contactSchema = z.object({
  firstName: z.string().trim().min(2, "First name must be at least 2 characters").max(50, "First name must be less than 50 characters"),
  lastName: z.string().trim().min(2, "Last name must be at least 2 characters").max(50, "Last name must be less than 50 characters"),
  email: z.string().trim().email("Invalid email address").max(255, "Email must be less than 255 characters"),
  phone: z.string().trim().regex(
    /^[\+]?[(]?[0-9]{1,3}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,4}[-\s\.]?[0-9]{1,9}$/,
    "Please enter a valid phone number"
  ),
  streetAddress: z.string().trim().min(5, "Street address is required").max(200, "Street address must be less than 200 characters"),
  city: z.string().trim().min(2, "City is required").max(100, "City must be less than 100 characters"),
  state: z.string().trim().length(2, "State must be 2 characters"),
  zipCode: z.string().trim().regex(/^\d{5}$/, "ZIP code must be 5 digits"),
  leadSource: z.string().min(1, "Please select how you heard about us"),
  bestTimeToContact: z.string().optional(),
  notes: z.string().trim().max(500, "Notes must be less than 500 characters").optional(),
  termsConsent: z.boolean().refine((val) => val === true, "You must agree to the Terms and Conditions"),
});

export type ContactInfoData = z.infer<typeof contactSchema>;

interface ContactInfoStepProps {
  onNext: (data: ContactInfoData) => void;
  onBack: () => void;
  initialData?: ContactInfoData;
}

export const ContactInfoStep = ({
  onNext,
  onBack,
  initialData,
}: ContactInfoStepProps) => {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isValid },
  } = useForm<ContactInfoData>({
    resolver: zodResolver(contactSchema),
    mode: "onChange",
    defaultValues: initialData || {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      streetAddress: "",
      city: "",
      state: "",
      zipCode: "",
      leadSource: "",
      bestTimeToContact: "",
      notes: "",
      termsConsent: false,
    },
  });

  // eslint-disable-next-line react-hooks/incompatible-library -- React Hook Form's watch() API is expected to be non-memoizable
  const termsConsent = watch("termsConsent");
  const notes = watch("notes") || "";
  const phoneValue = watch("phone");

  // Auto-format phone number to (XXX) XXX-XXXX
  const formatPhoneNumber = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    if (numbers.length === 0) return "";
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 6) return `(${numbers.slice(0, 3)}) ${numbers.slice(3)}`;
    return `(${numbers.slice(0, 3)}) ${numbers.slice(3, 6)}-${numbers.slice(6, 10)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setValue("phone", formatted, { shouldValidate: true });
  };

  const onSubmit = (data: ContactInfoData) => {
    onNext(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Get Your Estimate</h2>
        <p className="text-muted-foreground">
          We&apos;ll email you a detailed estimate immediately
        </p>
      </div>

      <div className="space-y-4">
        {/* First Name & Last Name */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="firstName" className="flex items-center gap-2">
              <User className="w-4 h-4" />
              First Name *
            </Label>
            <Input
              id="firstName"
              {...register("firstName")}
              placeholder="John"
              className={errors.firstName ? "border-destructive" : ""}
            />
            {errors.firstName && (
              <p className="text-sm text-destructive">{errors.firstName.message}</p>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="lastName">Last Name *</Label>
            <Input
              id="lastName"
              {...register("lastName")}
              placeholder="Smith"
              className={errors.lastName ? "border-destructive" : ""}
            />
            {errors.lastName && (
              <p className="text-sm text-destructive">{errors.lastName.message}</p>
            )}
          </div>
        </div>

        {/* Email */}
        <div className="space-y-2">
          <Label htmlFor="email" className="flex items-center gap-2">
            <Mail className="w-4 h-4" />
            Email Address *
          </Label>
          <Input
            id="email"
            type="email"
            {...register("email")}
            placeholder="john.smith@example.com"
            className={errors.email ? "border-destructive" : ""}
          />
          {errors.email && (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          )}
        </div>

        {/* Phone */}
        <div className="space-y-2">
          <Label htmlFor="phone" className="flex items-center gap-2">
            <Phone className="w-4 h-4" />
            Phone Number *
          </Label>
          <Input
            id="phone"
            type="tel"
            value={phoneValue}
            onChange={handlePhoneChange}
            placeholder="(201) 555-0123"
            maxLength={14}
            className={errors.phone ? "border-destructive" : ""}
          />
          {errors.phone && (
            <p className="text-sm text-destructive">{errors.phone.message}</p>
          )}
        </div>

        {/* Project Address Section */}
        <div className="space-y-4 pt-4 border-t">
          <h3 className="font-semibold flex items-center gap-2">
            <Home className="w-4 h-4" />
            Project Address
          </h3>
          
          {/* Street Address */}
          <div className="space-y-2">
            <Label htmlFor="streetAddress">Street Address *</Label>
            <Input
              id="streetAddress"
              {...register("streetAddress")}
              placeholder="123 Main Street"
              className={errors.streetAddress ? "border-destructive" : ""}
            />
            {errors.streetAddress && (
              <p className="text-sm text-destructive">{errors.streetAddress.message}</p>
            )}
          </div>

          {/* City, State, ZIP */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City *</Label>
              <Input
                id="city"
                {...register("city")}
                placeholder="Montclair"
                className={errors.city ? "border-destructive" : ""}
              />
              {errors.city && (
                <p className="text-sm text-destructive">{errors.city.message}</p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="state">State *</Label>
              <Input
                id="state"
                {...register("state")}
                placeholder="NJ"
                maxLength={2}
                className={errors.state ? "border-destructive" : ""}
              />
              {errors.state && (
                <p className="text-sm text-destructive">{errors.state.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="zipCode" className="flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              ZIP Code *
            </Label>
            <Input
              id="zipCode"
              {...register("zipCode")}
              placeholder="07001"
              maxLength={5}
              className={errors.zipCode ? "border-destructive" : ""}
            />
            {errors.zipCode && (
              <p className="text-sm text-destructive">{errors.zipCode.message}</p>
            )}
          </div>
        </div>

        {/* Lead Source */}
        <div className="space-y-2">
          <Label htmlFor="leadSource">How did you hear about us? *</Label>
          <Select onValueChange={(value) => setValue("leadSource", value, { shouldValidate: true })}>
            <SelectTrigger className={errors.leadSource ? "border-destructive" : ""}>
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="google">Google</SelectItem>
              <SelectItem value="facebook">Facebook</SelectItem>
              <SelectItem value="referral">Referral</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
          {errors.leadSource && (
            <p className="text-sm text-destructive">{errors.leadSource.message}</p>
          )}
        </div>

        {/* Best Time to Contact */}
        <div className="space-y-2">
          <Label htmlFor="bestTimeToContact">Best time to contact (Optional)</Label>
          <Select onValueChange={(value) => setValue("bestTimeToContact", value)}>
            <SelectTrigger>
              <SelectValue placeholder="Select preferred time" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="morning">Morning</SelectItem>
              <SelectItem value="afternoon">Afternoon</SelectItem>
              <SelectItem value="evening">Evening</SelectItem>
              <SelectItem value="anytime">Anytime</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor="notes">Additional Notes (Optional)</Label>
          <Textarea
            id="notes"
            {...register("notes")}
            placeholder="Any specific requirements or questions..."
            rows={4}
            maxLength={500}
            className={errors.notes ? "border-destructive" : ""}
          />
          <div className="flex justify-between items-center text-xs">
            <span className={errors.notes ? "text-destructive" : "text-muted-foreground"}>
              {errors.notes?.message || ""}
            </span>
            <span className="text-muted-foreground">
              {notes.length} / 500 characters
            </span>
          </div>
        </div>

        {/* TCPA Consent Checkbox */}
        <div className="flex items-start gap-3 p-4 border rounded-lg bg-background">
          <Checkbox
            id="termsConsent"
            checked={termsConsent}
            onCheckedChange={(checked) => setValue("termsConsent", checked as boolean, { shouldValidate: true })}
            className={errors.termsConsent ? "border-destructive" : ""}
          />
          <div className="space-y-1.5">
            <Label htmlFor="termsConsent" className="font-medium cursor-pointer">
              I agree to the Terms and Conditions *
            </Label>
            <p className="text-xs text-muted-foreground leading-relaxed">
              By checking this box, you agree to our{" "}
              <a href="/terms-and-conditions" target="_blank" className="text-primary hover:underline">
                Terms and Conditions
              </a>{" "}
              and{" "}
              <a href="/privacy-policy" target="_blank" className="text-primary hover:underline">
                Privacy Policy
              </a>
              . You consent to receive calls, texts, and emails from us about your project. Standard message and data rates may apply. You can opt out at any time.
            </p>
            {errors.termsConsent && (
              <p className="text-sm text-destructive">{errors.termsConsent.message}</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-between pt-6">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          className="min-w-[120px]"
        >
          Back
        </Button>
        <Button
          type="submit"
          className="min-w-[120px]"
          disabled={!isValid}
        >
          Get My Estimate
        </Button>
      </div>
    </form>
  );
};

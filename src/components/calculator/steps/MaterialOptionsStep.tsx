import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MaterialOptionsData {
  selectedOptions: string[];
}

interface MaterialOptionsStepProps {
  onNext: (data: MaterialOptionsData) => void;
  onBack: () => void;
  initialData?: MaterialOptionsData;
  projectType: "bathroom" | "kitchen" | "living-space";
}

interface OptionItem {
  id: string;
  label: string;
  description: string;
  tooltip: string;
}

interface OptionCategory {
  title: string;
  options: OptionItem[];
}

// Bathroom Options
const bathroomCategories: OptionCategory[] = [
  {
    title: "Fixtures",
    options: [
      {
        id: "luxury-vanity",
        label: "Luxury Vanity",
        description: "Premium vanity with soft-close drawers",
        tooltip: "Includes undermount sink, quartz countertop, and custom storage solutions",
      },
      {
        id: "dual-sink",
        label: "Dual Sink Vanity",
        description: "Double sink configuration",
        tooltip: "Perfect for shared bathrooms, requires minimum 60-inch vanity width",
      },
      {
        id: "soaking-tub",
        label: "Soaking Tub",
        description: "Freestanding or alcove soaking tub",
        tooltip: "Deep tub design for ultimate relaxation, available in various materials",
      },
      {
        id: "rainfall-shower",
        label: "Rainfall Shower Head",
        description: "Overhead rainfall shower experience",
        tooltip: "Large 10-12 inch shower head with adjustable pressure settings",
      },
    ],
  },
  {
    title: "Finishes",
    options: [
      {
        id: "custom-tile",
        label: "Custom Tile Work",
        description: "Designer tile patterns and materials",
        tooltip: "Includes subway, mosaic, or large format tiles with custom layouts",
      },
      {
        id: "heated-floor",
        label: "Heated Floor",
        description: "Radiant floor heating system",
        tooltip: "Electric radiant heating with programmable thermostat for comfort",
      },
    ],
  },
  {
    title: "Features",
    options: [
      {
        id: "led-mirror",
        label: "LED Mirror",
        description: "Backlit LED bathroom mirror",
        tooltip: "Energy-efficient LED lighting with anti-fog features",
      },
      {
        id: "bluetooth-fan",
        label: "Bluetooth Exhaust Fan",
        description: "Smart ventilation with speakers",
        tooltip: "Combines ventilation with Bluetooth audio streaming capability",
      },
    ],
  },
];

// Kitchen Options
const kitchenCategories: OptionCategory[] = [
  {
    title: "Cabinets & Storage",
    options: [
      {
        id: "custom-cabinets",
        label: "Custom Cabinetry",
        description: "Built-to-fit custom cabinets",
        tooltip: "Handcrafted cabinets designed specifically for your space and needs",
      },
      {
        id: "soft-close-drawers",
        label: "Soft-Close Drawers",
        description: "All drawers with soft-close mechanism",
        tooltip: "Quiet, smooth closing drawers that prevent slamming and extend life",
      },
      {
        id: "pantry-system",
        label: "Walk-In Pantry",
        description: "Organized pantry storage system",
        tooltip: "Custom shelving and organization system for maximum storage efficiency",
      },
    ],
  },
  {
    title: "Countertops & Surfaces",
    options: [
      {
        id: "quartz-countertops",
        label: "Quartz Countertops",
        description: "Engineered quartz surfaces",
        tooltip: "Durable, non-porous material available in various colors and patterns",
      },
      {
        id: "tile-backsplash",
        label: "Designer Backsplash",
        description: "Custom tile backsplash design",
        tooltip: "Includes glass, ceramic, or natural stone tiles with custom patterns",
      },
      {
        id: "waterfall-edge",
        label: "Waterfall Edge Island",
        description: "Countertop cascading down sides",
        tooltip: "Dramatic design element where countertop material flows over island edges",
      },
    ],
  },
  {
    title: "Appliances & Fixtures",
    options: [
      {
        id: "stainless-appliances",
        label: "Stainless Steel Appliance Package",
        description: "High-end appliance suite",
        tooltip: "Includes refrigerator, range, dishwasher, and microwave in matching finish",
      },
      {
        id: "farmhouse-sink",
        label: "Farmhouse Sink",
        description: "Deep apron-front sink",
        tooltip: "Large capacity sink perfect for cleaning large pots and pans",
      },
      {
        id: "pot-filler",
        label: "Pot Filler Faucet",
        description: "Wall-mounted faucet over stove",
        tooltip: "Convenient fold-out faucet for filling pots directly on the stove",
      },
    ],
  },
];

// Living Space Options
const livingSpaceCategories: OptionCategory[] = [
  {
    title: "Flooring",
    options: [
      {
        id: "hardwood-floors",
        label: "Hardwood Flooring",
        description: "Premium hardwood installation",
        tooltip: "Real wood flooring in oak, maple, or walnut with professional finish",
      },
      {
        id: "luxury-vinyl",
        label: "Luxury Vinyl Plank",
        description: "Water-resistant vinyl flooring",
        tooltip: "Durable, waterproof flooring that mimics hardwood appearance",
      },
    ],
  },
  {
    title: "Walls & Ceilings",
    options: [
      {
        id: "crown-molding",
        label: "Crown Molding",
        description: "Decorative ceiling trim",
        tooltip: "Elegant trim work that adds character and visual height to rooms",
      },
      {
        id: "accent-wall",
        label: "Accent Wall Treatment",
        description: "Featured wall with special finish",
        tooltip: "Includes options like shiplap, board & batten, or textured paint",
      },
      {
        id: "coffered-ceiling",
        label: "Coffered Ceiling",
        description: "Recessed ceiling panel design",
        tooltip: "Architectural detail with sunken panels for elegant, dimensional look",
      },
    ],
  },
  {
    title: "Built-Ins & Features",
    options: [
      {
        id: "built-in-shelving",
        label: "Built-In Shelving",
        description: "Custom wall-to-wall shelves",
        tooltip: "Floor-to-ceiling shelving units designed to fit your space perfectly",
      },
      {
        id: "fireplace-surround",
        label: "Fireplace Surround",
        description: "Custom fireplace mantel and surround",
        tooltip: "Stone, tile, or wood surround with custom mantel design",
      },
      {
        id: "recessed-lighting",
        label: "Recessed LED Lighting",
        description: "Modern flush-mount ceiling lights",
        tooltip: "Energy-efficient LED fixtures with dimming capability",
      },
    ],
  },
];

const categoryMap = {
  bathroom: bathroomCategories,
  kitchen: kitchenCategories,
  "living-space": livingSpaceCategories,
};

export const MaterialOptionsStep = ({
  onNext,
  onBack,
  initialData,
  projectType,
}: MaterialOptionsStepProps) => {
  const [selectedOptions, setSelectedOptions] = useState<string[]>(
    initialData?.selectedOptions || []
  );

  const categories = categoryMap[projectType];

  const handleToggleOption = (optionId: string) => {
    setSelectedOptions((prev) =>
      prev.includes(optionId)
        ? prev.filter((id) => id !== optionId)
        : [...prev, optionId]
    );
  };

  const handleSubmit = () => {
    onNext({
      selectedOptions,
    });
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Select Your Features</h2>
        <p className="text-muted-foreground">
          Choose the options you'd like (you can select multiple)
        </p>
      </div>

      <TooltipProvider>
        <div className="space-y-6">
          {categories.map((category) => (
            <div key={category.title} className="space-y-3">
              <h3 className="text-lg font-semibold border-b pb-2">
                {category.title}
              </h3>
              <div className="space-y-3">
                {category.options.map((option) => (
                  <div
                    key={option.id}
                    className={cn(
                      "flex items-center space-x-3 p-3 rounded-lg border transition-all cursor-pointer",
                      selectedOptions.includes(option.id)
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    )}
                    onClick={() => handleToggleOption(option.id)}
                  >
                    <Checkbox
                      id={option.id}
                      checked={selectedOptions.includes(option.id)}
                      onCheckedChange={() => handleToggleOption(option.id)}
                    />
                    <div className="flex-1 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Label
                          htmlFor={option.id}
                          className="font-semibold cursor-pointer"
                        >
                          {option.label}
                        </Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center justify-center min-w-6 min-h-6 w-6 h-6 text-muted-foreground hover:text-foreground"
                            >
                              <HelpCircle className="w-4 h-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>{option.tooltip}</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {option.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </TooltipProvider>

      <div className="flex justify-between pt-6">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          size="lg"
          className="min-w-[140px] h-12"
        >
          Back
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          size="lg"
          className="min-w-[200px] h-12 bg-gradient-to-r from-primary to-accent-sunset hover:shadow-lg transition-all duration-300"
        >
          Next
        </Button>
      </div>
    </div>
  );
};

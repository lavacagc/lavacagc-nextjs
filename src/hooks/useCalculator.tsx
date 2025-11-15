import { useState, useCallback } from "react";
import {
  CalculatorFormData,
  CalculatorResult,
  CalculatorProjectType,
  CalculatorCategoryWithItems,
} from "@/types/calculator";

export const useCalculator = (
  projectType: CalculatorProjectType | null,
  categories: CalculatorCategoryWithItems[]
) => {
  const [formData, setFormData] = useState<Partial<CalculatorFormData>>({
    state: "NJ",
    marketing_consent: false,
    assessment_requested: false,
    consultation_requested: false,
    dimension_mode: "sqft",
    selected_options: {},
  });

  const updateFormData = useCallback(
    (updates: Partial<CalculatorFormData>) => {
      setFormData((prev) => ({ ...prev, ...updates }));
    },
    []
  );

  const calculateEstimate = useCallback((): CalculatorResult | null => {
    if (!projectType || !formData.square_footage) return null;

    const sqft = formData.square_footage;
    const seasonalMultiplier = projectType.seasonal_multiplier || 1.0;

    // Calculate base costs
    const baseMaterialCost =
      projectType.base_material_cost_per_sqft * sqft * seasonalMultiplier;
    const baseLaborCost =
      projectType.base_labor_cost_per_sqft * sqft * seasonalMultiplier;
    const baseCost = baseMaterialCost + baseLaborCost;

    // Calculate options costs
    let optionsMaterialCost = 0;
    let optionsLaborCost = 0;
    const selectedItems: CalculatorResult["selected_items"] = [];

    Object.entries(formData.selected_options || {}).forEach(
      ([categoryId, itemId]) => {
        const category = categories.find((cat) => cat.id === categoryId);
        const item = category?.items.find((i) => i.id === itemId);

        if (item) {
          let itemMaterialCost = item.material_cost;
          let itemLaborCost = item.labor_cost;

          // Apply modifiers
          switch (item.modifier_type) {
            case "additive":
              // Add percentage to base
              if (item.modifier_value) {
                itemMaterialCost += baseMaterialCost * item.modifier_value;
                itemLaborCost += baseLaborCost * item.modifier_value;
              }
              break;
            case "multiplicative":
              // Multiply base
              if (item.modifier_value) {
                itemMaterialCost = baseMaterialCost * item.modifier_value;
                itemLaborCost = baseLaborCost * item.modifier_value;
              }
              break;
            case "reductive":
              // Reduce base (negative percentage)
              if (item.modifier_value) {
                itemMaterialCost += baseMaterialCost * item.modifier_value;
                itemLaborCost += baseLaborCost * item.modifier_value;
              }
              break;
            case "fixed":
              // Use fixed cost (already in item.material_cost/labor_cost)
              break;
          }

          optionsMaterialCost += itemMaterialCost;
          optionsLaborCost += itemLaborCost;

          selectedItems.push({
            category_name: category?.name || "",
            item_name: item.name,
            display_label: item.display_label || item.name,
            material_cost: itemMaterialCost,
            labor_cost: itemLaborCost,
            total_cost: itemMaterialCost + itemLaborCost,
          });
        }
      }
    );

    const totalMaterialCost = baseMaterialCost + optionsMaterialCost;
    const totalLaborCost = baseLaborCost + optionsLaborCost;
    const combinedTotal = totalMaterialCost + totalLaborCost;

    // Calculate range (±20%)
    const estimateRangeMin = combinedTotal * 0.8;
    const estimateRangeMax = combinedTotal * 1.2;

    return {
      base_cost: baseCost,
      base_material_cost: baseMaterialCost,
      base_labor_cost: baseLaborCost,
      options_cost: optionsMaterialCost + optionsLaborCost,
      options_material_cost: optionsMaterialCost,
      options_labor_cost: optionsLaborCost,
      seasonal_adjustment: seasonalMultiplier,
      total_material_cost: totalMaterialCost,
      total_labor_cost: totalLaborCost,
      combined_total: combinedTotal,
      estimate_range_min: estimateRangeMin,
      estimate_range_max: estimateRangeMax,
      selected_items: selectedItems,
    };
  }, [projectType, formData, categories]);

  return {
    formData,
    updateFormData,
    calculateEstimate,
  };
};

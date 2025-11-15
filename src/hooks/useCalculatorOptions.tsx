import { useQuery } from "@tanstack/react-query";
import { calculatorService } from "@/services/calculatorService";

export const useCalculatorOptions = (projectTypeId: string | null) => {
  return useQuery({
    queryKey: ["calculator-options", projectTypeId],
    queryFn: () => {
      if (!projectTypeId) return Promise.resolve([]);
      return calculatorService.getCategoriesWithItems(projectTypeId);
    },
    enabled: !!projectTypeId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
};

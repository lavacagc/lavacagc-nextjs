import { useQuery } from "@tanstack/react-query";
import { calculatorService } from "@/services/calculatorService";

export const useProjectTypes = () => {
  return useQuery({
    queryKey: ["project-types"],
    queryFn: () => calculatorService.getProjectTypes(),
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes
  });
};

export const useProjectTypeByName = (name: string | null) => {
  return useQuery({
    queryKey: ["project-type", name],
    queryFn: () => {
      if (!name) return Promise.resolve(null);
      return calculatorService.getProjectTypeByName(name);
    },
    enabled: !!name,
    staleTime: 10 * 60 * 1000,
  });
};

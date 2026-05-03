import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";

import { addToQueue } from "@/services/offlineQueue";

export function useOfflineMutation<TData, TVariables extends Record<string, unknown>>(
  mutationKey: string[],
  mutationFn: (vars: TVariables) => Promise<TData>,
  onSuccess?: (data: TData) => void,
) {
  const queryClient = useQueryClient();

  const mutate = useCallback(async (variables: TVariables) => {
    try {
      const result = await mutationFn(variables);
      onSuccess?.(result);
      await queryClient.invalidateQueries({ queryKey: mutationKey });
      return result;
    } catch (error) {
      const axiosError = error as AxiosError;
      const isNetworkFailure =
        axiosError.response === undefined ||
        axiosError.code === "ERR_NETWORK" ||
        axiosError.message === "Network Error";

      if (isNetworkFailure) {
        addToQueue({ mutationKey, payload: variables, maxRetries: 3 });
      }
      throw error;
    }
  }, [mutationFn, mutationKey, onSuccess, queryClient]);

  return { mutate, mutateAsync: mutate };
}

import type {
  Department,
  DepartmentDetail,
  Employee,
  EmployeeDetail,
  Entity,
  Health,
  Neighborhood,
  Project,
  ProjectDetail,
  SearchResult,
} from "@/lib/types";

const baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  const signal = options.signal
    ? AbortSignal.any([controller.signal, options.signal])
    : controller.signal;
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      signal,
      headers: { Accept: "application/json", ...options.headers },
      cache: "no-store",
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : response.status === 503
            ? "The company data service is temporarily unavailable."
            : `Request failed (${response.status}).`;
      throw new ApiError(message, response.status);
    }
    if (payload === null) throw new ApiError("The server returned an empty response.", response.status);
    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError("The request timed out. Check your connection and try again.", null);
    }
    throw new ApiError("Could not reach the company data service. Make sure the backend is running.", null);
  } finally {
    clearTimeout(timeout);
  }
}

const query = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => value && search.set(key, value));
  const suffix = search.toString();
  return suffix ? `?${suffix}` : "";
};

export const api = {
  health: () => request<Health>("/health"),
  company: () => request<Entity>("/api/company"),
  employees: (filters: { departmentId?: string; teamId?: string; employmentStatus?: string } = {}) =>
    request<Employee[]>(`/api/employees${query(filters)}`),
  employee: (id: string) => request<EmployeeDetail>(`/api/employees/${encodeURIComponent(id)}`),
  departments: () => request<Department[]>("/api/departments"),
  department: (id: string) => request<DepartmentDetail>(`/api/departments/${encodeURIComponent(id)}`),
  projects: () => request<Project[]>("/api/projects"),
  project: (id: string) => request<ProjectDetail>(`/api/projects/${encodeURIComponent(id)}`),
  neighborhood: (type: string, id: string) =>
    request<Neighborhood>(`/api/graph/neighborhood/${encodeURIComponent(type)}/${encodeURIComponent(id)}`),
  search: (term: string, signal?: AbortSignal) =>
    request<SearchResult[]>(`/api/search${query({ q: term })}`, { signal }),
};

export function entityName(entity: Entity): string {
  const value = entity.name ?? entity.title ?? entity.id;
  return typeof value === "string" ? value : entity.id;
}

export function friendlyApiError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) return "We couldn't find that record.";
    if (error.status === 400) return "That request isn't valid. Check your search or filters.";
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

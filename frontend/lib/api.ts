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
  GraphResponse,
  SearchResult,
  IngestionSource,
  IngestionResponse,
  AssistantQuery,
  AssistantResponse,
  DashboardResponse,
  SourceRecordResponse,
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

async function request<T>(path: string, options: RequestInit = {}, timeoutMs = 12_000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const signal = options.signal
    ? AbortSignal.any([controller.signal, options.signal])
    : controller.signal;
  try {
    const identity = typeof window !== "undefined" ? window.localStorage.getItem("oig-demo-workspace") ?? "demo@hirenova.example" : "demo@hirenova.example";
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      signal,
      headers: { Accept: "application/json", "x-orgmind-user-id": identity, ...options.headers },
      cache: "no-store",
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const workflowErrors = typeof payload === "object" && payload !== null && "errors" in payload && Array.isArray(payload.errors)
        ? payload.errors.filter((item): item is string => typeof item === "string").join(" ")
        : "";
      const message =
        typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : workflowErrors || (response.status === 503
            ? "The company data service is temporarily unavailable."
            : `Request failed (${response.status}).`);
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
  dashboard: () => request<DashboardResponse>("/api/dashboard"),
  dashboardSummary: () => request<Pick<DashboardResponse, "company" | "sourceCounts" | "totals">>("/api/dashboard/summary"),
  graph: () => request<GraphResponse>("/api/graph"),
  productProgressGraph: () => request<GraphResponse>("/api/product-progress/graph"),
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
  processIngestion: (source: IngestionSource, limit = 20) => request<IngestionResponse>("/api/ingestion/process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, limit }),
  }),
  documents: (params: { q?: string; limit?: number; offset?: number } = {}) => request<SourceRecordResponse>(`/api/documents${query({ q: params.q, limit: params.limit?.toString(), offset: params.offset?.toString() })}`),
  tickets: (params: { q?: string; limit?: number; offset?: number } = {}) => request<SourceRecordResponse>(`/api/tickets${query({ q: params.q, limit: params.limit?.toString(), offset: params.offset?.toString() })}`),
  conversations: (params: { q?: string; limit?: number; offset?: number } = {}) => request<SourceRecordResponse>(`/api/conversations${query({ q: params.q, limit: params.limit?.toString(), offset: params.offset?.toString() })}`),
  proactiveInsights: (params: { q?: string; limit?: number; offset?: number } = {}) => request<SourceRecordResponse>(`/api/proactive-insights${query({ q: params.q, limit: params.limit?.toString(), offset: params.offset?.toString() })}`),
  assistantQuery: (input: AssistantQuery) => request<AssistantResponse>("/api/assistant/query", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  }),
  organizationQuery: (input: { query: string; history?: { query: string; answer: string }[]; topK?: number; threshold?: number; orgId?: string }) => request<import("@/lib/types").OrganizationRagResponse>("/api/organization/query", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  }, 120_000),
  assistantConversations: () => request<{ conversations: import("@/lib/types").AssistantConversation[] }>("/api/assistant/conversations"),
  assistantConversation: (id: string) => request<{ conversationId: string; turns: import("@/lib/types").AssistantTurn[] }>(`/api/assistant/conversations/${encodeURIComponent(id)}`),
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

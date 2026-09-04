import type { Action, AgentChatResponse, AuditLogEntry, DashboardStats, PaymentResult, PaymentStatus, PolicyEvaluationResult, Product } from "../types";
const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

async function request<T>(path:string, init?:RequestInit):Promise<T>{
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers:{ "Content-Type":"application/json", ...(init?.headers||{}) }});
  const body = await res.json().catch(()=>null);
  if(!res.ok){
    const message = body?.message || "Request failed";
    const error = Object.assign(new Error(message), { code:body?.code, statusCode:res.status });
    throw error;
  }
  return body as T;
}
export const apiHealth = () => request<{status:string;mongodb:string;uptimeSeconds:number}>("/health");
export const apiProducts = () => request<Product[]>("/products");
export const apiAgentChat = (message:string, conversationId?:string) =>
  request<AgentChatResponse>("/agent/chat",{method:"POST",body:JSON.stringify({message,...(conversationId?{conversationId}: {})})});
export const apiValidateAction = (proposal:Action["proposal"] & {conversationId?:string}) =>
  request<{actionId:string}&PolicyEvaluationResult>("/actions/validate",{method:"POST",body:JSON.stringify(proposal)});
export const apiApproveAction = (actionId:string) =>
  request<{success:true;actionId:string;approvalStatus?:string}>("/actions/approve",{method:"POST",body:JSON.stringify({actionId})});
export const apiCreatePayment = (actionId:string) =>
  request<PaymentResult>("/payments/create",{method:"POST",body:JSON.stringify({actionId})});
export const apiPaymentStatus = (orderId:string) => request<PaymentStatus>(`/payments/${encodeURIComponent(orderId)}/status`);
export const apiDashboard = () => request<DashboardStats>("/dashboard/stats");
export const apiAudit = (limit=50) => request<AuditLogEntry[]>(`/audit?limit=${limit}`);
export const apiSimulation = (scenarioId:number) => request<{scenario:{id:number;name:string};expected:string;result:unknown}>("/simulation/run",{method:"POST",body:JSON.stringify({scenarioId})});

export interface DashboardClient { get(path: string): Promise<unknown>; delete(path: string): Promise<unknown>; post(path: string): Promise<unknown> }

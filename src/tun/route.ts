export interface TunRoute { readonly cidr: string; readonly gateway?: string }
export interface TunRouteManager { install(routes: readonly TunRoute[]): Promise<void>; remove(routes: readonly TunRoute[]): Promise<void> }

export class UnsupportedTunRouteManager implements TunRouteManager {
  public install(routes: readonly TunRoute[]): Promise<void> { void routes; return Promise.reject(new Error("native TUN route management requires a platform adapter and administrator privileges")); }
  public remove(routes: readonly TunRoute[]): Promise<void> { void routes; return Promise.reject(new Error("native TUN route management requires a platform adapter and administrator privileges")); }
}

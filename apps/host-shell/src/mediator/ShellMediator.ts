/**
 * GoF Mediator Pattern (19)
 * Host Shell đóng vai trò trung gian điều phối dữ liệu giữa 6 Remote MFE, triệt tiêu import chéo
 */
export class ShellMediator {
  public notify(sender: string, event: string, payload: any): void {
    console.log(`[Mediator] Event from ${sender}: ${event}`, payload);
  }
}

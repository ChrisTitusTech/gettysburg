interface LeaveableRoom {
  readonly connection?: { readonly isOpen: boolean };
  leave(consented: boolean): Promise<number>;
}

export function leaveOpenRoom(room: LeaveableRoom) {
  // Colyseus leave(true) sends a message even when its socket is closing.
  // Server-side deletion/revocation may have already initiated that close.
  if (room.connection?.isOpen) return room.leave(true);
}

// PROTOTYPE: throwaway page for variant B of the notification UI prototype. Do not ship.
import { useRouteLoaderData } from "react-router";
import { NotificationsPagePrototype } from "~/components/notifications.prototype";

export default function NotificationsPrototypeRoute() {
  const data = useRouteLoaderData("routes/layout.app") as
    | { currentUser: { id: number; role: never } | null; isTeamAdmin: boolean }
    | undefined;
  return (
    <NotificationsPagePrototype
      user={data?.currentUser ?? null}
      isTeamAdmin={data?.isTeamAdmin ?? false}
    />
  );
}

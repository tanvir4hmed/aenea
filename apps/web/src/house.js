import layout from '../../../functions/house_layout.json';
export const house = layout.location;
export const floors = layout.floors;
export const houseRooms = floors.flatMap(floor => floor.rooms);
export const isMapleHouse = catalog => catalog.locations.length === 1 && catalog.locations[0].id === house.id;
export function furnishedCatalog(revision = null) {
  return { revision, locations: [{ ...house }], devices: layout.devices.map(([room, type, label], index) => ({
    id: `c7413b88-57f4-4c23-b6ea-${String(index + 1).padStart(12, '0')}`,
    location_id: house.id, name: `${room} · ${label}`, room, type, connection: 'simulation', enabled: true,
  })) };
}

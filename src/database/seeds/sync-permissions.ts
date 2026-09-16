import { DataSource, In } from 'typeorm';
import { Permission } from '../../modules/permissions/entities/permission.entity';
import { Role } from '../../modules/roles/entities/role.entity';
import { PermissionEnum } from '../../common/enums/permission.enum';
import { RBAC_CONFIG } from '../../common/constants/rbac.config';
import { RoleEnum } from '../../common/enums/role.enum';
import AppDataSource from '../data-source';

export async function syncPermissions(dataSource: DataSource) {
  const permissionRepo = dataSource.getRepository(Permission);
  const roleRepo = dataSource.getRepository(Role);

  const existingPermissions = await permissionRepo.find();
  const permissionMap = new Map(existingPermissions.map((p) => [p.name, p]));

  let addedCount = 0;
  const allPermissionNames = Object.values(PermissionEnum);

  for (const permName of allPermissionNames) {
    if (!permissionMap.has(permName)) {
      const newPerm = await permissionRepo.save({ name: permName, isActive: true });
      permissionMap.set(permName, newPerm);
      console.log(`+ Added new permission: ${permName}`);
      addedCount++;
    }
  }

  console.log(`Permissions sync complete. Added ${addedCount} new permissions.`);

  // Sync permissions to all existing roles
  const roles = await roleRepo.find({
    relations: { permissions: true },
  });

  const allPerms = Array.from(permissionMap.values());

  for (const role of roles) {
    const configPermNames = RBAC_CONFIG[role.name as RoleEnum];

    if (role.name === RoleEnum.SUPER_ADMIN || role.name === 'ADMIN' || role.isProtected) {
      role.permissions = allPerms;
      await roleRepo.save(role);
      console.log(`Updated SUPER_ADMIN role [${role.id}] with ${allPerms.length} permissions.`);
    } else if (configPermNames && Array.isArray(configPermNames)) {
      const matchedPerms = allPerms.filter((p) => configPermNames.includes(p.name as PermissionEnum));
      role.permissions = matchedPerms;
      await roleRepo.save(role);
      console.log(`Updated ${role.name} role [${role.id}] with ${matchedPerms.length} permissions.`);
    }
  }

  console.log(`RBAC role-permission syncing completed for ${roles.length} roles.`);
}

async function run() {
  await AppDataSource.initialize();
  console.log('Database connected.');
  await syncPermissions(AppDataSource);
  process.exit();
}

// Only run automatically if executed directly from terminal
if (require.main === module) {
  run();
}


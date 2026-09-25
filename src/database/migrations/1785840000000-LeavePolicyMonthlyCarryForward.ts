import { MigrationInterface, QueryRunner } from "typeorm";

export class LeavePolicyMonthlyCarryForward1785840000000 implements MigrationInterface {
    name = 'LeavePolicyMonthlyCarryForward1785840000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "leave_policies" ADD COLUMN IF NOT EXISTS "monthly_carry_forward" boolean NOT NULL DEFAULT true`
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "leave_policies" DROP COLUMN IF EXISTS "monthly_carry_forward"`
        );
    }
}

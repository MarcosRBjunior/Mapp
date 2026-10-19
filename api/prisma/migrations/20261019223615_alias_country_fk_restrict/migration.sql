-- DropForeignKey
ALTER TABLE "country_alias" DROP CONSTRAINT "country_alias_country_code_fkey";

-- AddForeignKey
ALTER TABLE "country_alias" ADD CONSTRAINT "country_alias_country_code_fkey" FOREIGN KEY ("country_code") REFERENCES "country"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

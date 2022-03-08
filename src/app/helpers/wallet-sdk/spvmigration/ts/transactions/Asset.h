// Copyright (c) 2012-2018 The Elastos Open Source Project
// Distributed under the MIT software license, see the accompanying
// file COPYING or http://www.opensource.org/licenses/mit-license.php.

#ifndef __ELASTOS_SDK_SPVSDK_ASSET_H
#define __ELASTOS_SDK_SPVSDK_ASSET_H

#include <Plugin/Interface/ELAMessageSerializable.h>
#include <Common/JsonSerializer.h>

namespace Elastos {
	namespace ElaWallet {


		class Asset :
				 {
		public:
		
		public:
			Asset();

			Asset(const std::string &name, const std::string &desc, uint8_t precision,
				  AssetType assetType = Token, AssetRecordType recordType = Unspent);

			Asset(const Asset &asset);

			~Asset();

			Asset &operator=(const Asset &asset);

			void SetName(const std::string &name) {
				_name = name;
			}

			const std::string &GetName() const {
				return _name;
			}

			void SetDescription(const std::string &desc) {
				_description = desc;
			}

			const std::string &GetDescription() const {
				return _description;
			}

			void SetAssetType(Asset::AssetType type) {
				_assetType = type;
			}

			Asset::AssetType GetAssetType() const {
				return _assetType;
			}

			void SetAssetRecordType(Asset::AssetRecordType type) {
				_recordType = type;
			}

			Asset::AssetRecordType GetAssetRecordType() const {
				return _recordType;
			}

			void SetPrecision(uint8_t precision) {
				_precision = precision;
			}

			uint8_t GetPrecision() const {
				return _precision;
			}

			virtual size_t EstimateSize() const;

			virtual void Serialize(ByteStream &stream) const;

			virtual bool Deserialize(const ByteStream &stream);

			virtual nlohmann::json ToJson() const;

			virtual void FromJson(const nlohmann::json &jsonData);

			const uint256 &GetHash() const;

			void SetHash(const uint256 &hash);

			bool operator==(const Asset &asset) const;

		public:

		private:
		
		};

	}
}

#endif //__ELASTOS_SDK_SPVSDK_ASSET_H
